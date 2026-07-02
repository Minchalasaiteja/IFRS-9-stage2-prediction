from fastapi import APIRouter, Form, HTTPException, Depends, BackgroundTasks, Request, Response, Cookie, Body
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from typing import Optional
import secrets
import logging
from bson import ObjectId

from ..schemas import (
    UserCreate, UserLogin, TokenResponse, UserResponse,
    PasswordReset, PasswordChange, TwoFactorVerify, RefreshToken
)
from ..database import db
from ..auth.jwt_handler import JWTHandler
from ..auth.dependencies import get_current_user, RoleChecker
from ..auth.two_factor import TwoFactorAuth
from ..utils.email_service import EmailService
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter()
templates = Jinja2Templates(directory="templates")


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, remember_me: bool = False):
    access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400 if remember_me else None

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.PRODUCTION,
        samesite="lax",
        path="/",
        max_age=access_max_age,
        expires=access_max_age
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.PRODUCTION,
        samesite="lax",
        path="/",
        max_age=refresh_max_age,
        expires=refresh_max_age if refresh_max_age else None
    )

@router.post("/signup", response_model=TokenResponse)
async def signup(user_data: UserCreate, request: Request, background_tasks: BackgroundTasks):
    """Register new user"""
    try:
        # Check if user exists
        existing_user = await db.users.find_one({
            "$or": [
                {"email": user_data.email},
                {"username": user_data.username}
            ]
        })
        
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="User with this email or username already exists"
            )
        
        # Create user
        user_dict = user_data.dict()
        if not user_dict.get("last_name"):
            user_dict["last_name"] = user_dict["first_name"]

        # Make the first registered user an admin
        user_count = await db.users.count_documents({})
        assigned_role = "admin" if user_count == 0 else "user"
        
        user_dict.update({
            "password_hash": JWTHandler.hash_password(user_data.password),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "is_active": True,
            "is_verified": False,
            "role": assigned_role,
            "two_factor_enabled": False,
            "login_attempts": 0,
            "last_login": None
        })
        
        # Remove plain password
        del user_dict["password"]
        
        # Insert user
        result = await db.users.insert_one(user_dict)
        user_id = str(result.inserted_id)
        
        # Generate tokens
        access_token = JWTHandler.create_access_token({"sub": user_id})
        refresh_token = JWTHandler.create_refresh_token({"sub": user_id})
        
        # Send verification email
        verification_token = secrets.token_urlsafe(32)
        await db.users.update_one(
            {"_id": result.inserted_id},
            {"$set": {"verification_token": verification_token}}
        )
        
        background_tasks.add_task(
            EmailService.send_verification_email,
            user_data.email,
            verification_token,
            user_data.username
        )
        
        client_ip = request.client.host if request.client else "Unknown"
        user_agent = request.headers.get("user-agent", "Unknown")

        # Log audit
        await db.audit_logs.insert_one({
            "user_id": user_id,
            "action": "signup",
            "timestamp": datetime.utcnow(),
            "ip_address": client_ip,
            "user_agent": user_agent,
            "details": f"User registered with role: {assigned_role}"
        })
        
        response = JSONResponse(content={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "username": user_data.username,
                "email": user_data.email,
                "role": assigned_role
            }
        })
        set_auth_cookies(response, access_token, refresh_token)
        await db.sessions.insert_one({
            "user_id": user_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "remember_me": False,
            "ip_address": client_ip,
            "user_agent": user_agent,
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        })
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup failed: {e}")
        raise HTTPException(status_code=500, detail="Unable to complete signup at this time")

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    two_factor_code: Optional[str] = Form(None),
    remember_me: Optional[bool] = Form(False)
):
    """User login with optional 2FA"""
    # Find user by email or username
    user = await db.users.find_one({"$or": [{"email": form_data.username}, {"username": form_data.username}]})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check account lock
    if user.get("locked_until") and user["locked_until"] > datetime.utcnow():
        raise HTTPException(
            status_code=423,
            detail="Account temporarily locked. Try again later."
        )

    # Verify password
    if not JWTHandler.verify_password(form_data.password, user["password_hash"]):
        # Increment failed attempts
        attempts = user.get("login_attempts", 0) + 1
        update_data = {"login_attempts": attempts}
        
        if attempts >= settings.MAX_LOGIN_ATTEMPTS:
            update_data["locked_until"] = datetime.utcnow() + timedelta(minutes=settings.ACCOUNT_LOCKOUT_MINUTES)
        
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": update_data}
        )
        
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check 2FA if enabled
    if user.get("two_factor_enabled"):
        if not two_factor_code:
            raise HTTPException(
                status_code=403,
                detail="2FA code required",
                headers={"X-2FA-Required": "true"}
            )
        
        if not TwoFactorAuth.verify_code(user["two_factor_secret"], two_factor_code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
    
    # Generate tokens
    user_id = str(user["_id"])
    access_token = JWTHandler.create_access_token({"sub": user_id, "role": user["role"]})
    refresh_token = JWTHandler.create_refresh_token({"sub": user_id})
    
    # Update login info
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "last_login": datetime.utcnow(),
                "login_attempts": 0,
                "locked_until": None
            }
        }
    )
    
    client_ip = request.client.host if request.client else "Unknown"
    user_agent = request.headers.get("user-agent", "Unknown")

    response = JSONResponse(content={
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "two_factor_enabled": user.get("two_factor_enabled", False)
        }
    })
    set_auth_cookies(response, access_token, refresh_token, remember_me=remember_me)

    await db.sessions.insert_one({
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "remember_me": bool(remember_me),
        "ip_address": client_ip,
        "user_agent": user_agent,
        "created_at": datetime.utcnow(),
        "last_activity": datetime.utcnow(),
        "expires_at": datetime.utcnow() + (
            timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            if remember_me else
            timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
    })
    return response

@router.post("/2fa/setup")
async def setup_2fa(current_user: dict = Depends(get_current_user)):
    """Setup two-factor authentication"""
    secret = TwoFactorAuth.generate_secret()
    qr_code = TwoFactorAuth.generate_qr_code(current_user["email"], secret)
    
    # Store secret temporarily
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"temp_2fa_secret": secret}}
    )
    
    return {
        "secret": secret,
        "qr_code": qr_code
    }

@router.post("/2fa/verify")
async def verify_2fa(
    code: TwoFactorVerify,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Verify and enable 2FA"""
    user = await db.users.find_one({"_id": current_user["_id"]})
    secret = user.get("temp_2fa_secret")
    
    if not secret:
        raise HTTPException(status_code=400, detail="2FA setup not initiated")
    
    if TwoFactorAuth.verify_code(secret, code.code):
        await TwoFactorAuth.enable_2fa(str(user["_id"]), secret)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$unset": {"temp_2fa_secret": ""}}
        )
        
        # Send notification
        client_ip = request.client.host if request.client else "Unknown IP"
        await EmailService.send_2fa_notification(
            user["email"],
            user["username"],
            "enabled",
            client_ip
        )
        
        return {"message": "2FA enabled successfully"}
    
    raise HTTPException(status_code=400, detail="Invalid verification code")


@router.post("/2fa/disable")
async def disable_2fa(current_user: dict = Depends(get_current_user), request: Request = None):
    """Disable two-factor authentication for current user"""
    user = await db.users.find_one({"_id": current_user["_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success = await TwoFactorAuth.disable_2fa(str(user["_id"]))
    if success:
        client_ip = request.client.host if request and request.client else "Unknown IP"
        try:
            await EmailService.send_2fa_notification(user["email"], user.get("username", user.get("email")), "disabled", client_ip)
        except Exception:
            logger.warning("Failed to send 2FA disabled notification email")
        return {"message": "2FA disabled"}

    raise HTTPException(status_code=500, detail="Failed to disable 2FA")

@router.post("/password/reset-request")
async def request_password_reset(email: str, background_tasks: BackgroundTasks):
    """Request password reset"""
    user = await db.users.find_one({"email": email})
    
    if user:
        reset_token = secrets.token_urlsafe(32)
        await db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "reset_token": reset_token,
                    "reset_token_expires": datetime.utcnow() + timedelta(minutes=30)
                }
            }
        )
        
        background_tasks.add_task(
            EmailService.send_password_reset,
            email,
            reset_token,
            user["username"]
        )
    
    # Always return success to prevent email enumeration
    return {"message": "If the email exists, a reset link has been sent"}

@router.post("/password/reset")
async def reset_password(reset_data: PasswordReset):
    """Reset password with token"""
    user = await db.users.find_one({
        "reset_token": reset_data.token,
        "reset_token_expires": {"$gt": datetime.utcnow()}
    })
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": JWTHandler.hash_password(reset_data.new_password),
                "updated_at": datetime.utcnow()
            },
            "$unset": {
                "reset_token": "",
                "reset_token_expires": ""
            }
        }
    )
    
    return {"message": "Password reset successfully"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return current authenticated user information"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Convert ObjectId to string for JSON serialization
    if "_id" in current_user:
        current_user["_id"] = str(current_user["_id"])
    
    return current_user

@router.get("/verify-email")
async def verify_email(token: str):
    """Verify a user's email address"""
    user = await db.users.find_one({"verification_token": token})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    if user.get("is_verified"):
        return {"already_verified": True, "message": "Email already verified"}

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"is_verified": True},
            "$unset": {"verification_token": ""}
        }
    )

    return {"already_verified": False, "message": "Email verified successfully"}

@router.get("/resend-verification")
async def resend_verification(email: str, background_tasks: BackgroundTasks):
    """Resend verification email for a user"""
    user = await db.users.find_one({"email": email})
    if user and not user.get("is_verified", False):
        verification_token = secrets.token_urlsafe(32)
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"verification_token": verification_token}}
        )
        background_tasks.add_task(
            EmailService.send_verification_email,
            email,
            verification_token,
            user.get("username", email)
        )

    return {"message": "Verification email sent if the account exists"}

@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    request: Request,
    refresh_token: Optional[str] = Cookie(None),
    body: Optional[RefreshToken] = Body(None)
):
    """Refresh access token using a refresh token"""
    token = refresh_token or (body.refresh_token if body else None)
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    payload = JWTHandler.decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    session = await db.sessions.find_one({"refresh_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Session not found")

    now = datetime.utcnow()
    if session.get("expires_at") and session["expires_at"] < now:
        await db.sessions.delete_one({"_id": session["_id"]})
        raise HTTPException(status_code=401, detail="Session expired")

    if session.get("last_activity") and session["last_activity"] < now - timedelta(minutes=settings.SESSION_TIMEOUT_MINUTES):
        await db.sessions.delete_one({"_id": session["_id"]})
        raise HTTPException(status_code=401, detail="Session timed out")

    user_query_id = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
    user = await db.users.find_one({"_id": user_query_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = JWTHandler.create_access_token({"sub": user_id, "role": user.get("role", "user")})
    new_refresh_token = JWTHandler.create_refresh_token({"sub": user_id})
    remember_me = bool(session.get("remember_me", False))

    await db.sessions.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "access_token": access_token,
                "refresh_token": new_refresh_token,
                "last_activity": datetime.utcnow(),
                "expires_at": datetime.utcnow() + (
                    timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
                    if remember_me else
                    timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
                )
            }
        }
    )

    response = JSONResponse(content={
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "email": user["email"],
            "role": user.get("role", "user")
        }
    })
    set_auth_cookies(response, access_token, new_refresh_token, remember_me=remember_me)
    return response

@router.post("/change-password")
async def change_password(
    current_user: dict = Depends(get_current_user),
    password_change: PasswordChange = Body(...)
):
    """Change user password"""
    user = await db.users.find_one({"_id": current_user["_id"]})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    if not JWTHandler.verify_password(password_change.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Update password
    new_hash = JWTHandler.hash_password(password_change.new_password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": new_hash,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # Log audit
    await db.audit_logs.insert_one({
        "user_id": str(user["_id"]),
        "action": "password_changed",
        "timestamp": datetime.utcnow()
    })
    
    return {"message": "Password changed successfully"}

# ============================================================
# FIX: update_email endpoint - handle missing email service method
# ============================================================
@router.post("/update-email")
async def update_email(
    current_user: dict = Depends(get_current_user),
    email_update: dict = Body(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Update user email"""
    user = await db.users.find_one({"_id": current_user["_id"]})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_email = email_update.get("new_email")
    password = email_update.get("password")
    
    if not new_email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    
    # Verify password
    if not JWTHandler.verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Password is incorrect")
    
    # Check if new email already exists
    existing = await db.users.find_one({"email": new_email, "_id": {"$ne": user["_id"]}})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")
    
    # Generate verification token
    verification_token = secrets.token_urlsafe(32)
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "new_email": new_email,
                "email_verification_token": verification_token,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # FIX: Check if method exists before calling
    if hasattr(EmailService, 'send_email_change_verification'):
        # Send verification email if method exists
        background_tasks.add_task(
            EmailService.send_email_change_verification,
            new_email,
            verification_token,
            user.get("username", user.get("email"))
        )
    else:
        # Log that the method doesn't exist
        logger.warning(f"EmailService.send_email_change_verification not implemented. Email change requested for user: {user.get('username')}")
        # Optionally send a simple notification email
        try:
            background_tasks.add_task(
                EmailService.send_verification_email,
                new_email,
                verification_token,
                user.get("username", user.get("email"))
            )
        except Exception as e:
            logger.error(f"Failed to send verification email: {e}")
    
    # Log audit
    await db.audit_logs.insert_one({
        "user_id": str(user["_id"]),
        "action": "email_change_requested",
        "new_email": new_email,
        "timestamp": datetime.utcnow()
    })
    
    return {"message": "Verification email sent to new address"}

@router.post("/profile/contact")
async def update_contact_info(
    current_user: dict = Depends(get_current_user),
    contact_data: dict = Body(...)
):
    """Update user contact information"""
    user = await db.users.find_one({"_id": current_user["_id"]})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_fields = {
        "first_name": contact_data.get("first_name", ""),
        "last_name": contact_data.get("last_name", ""),
        "phone_number": contact_data.get("phone_number", ""),
        "address": contact_data.get("address", ""),
        "city": contact_data.get("city", ""),
        "postal_code": contact_data.get("postal_code", ""),
        "country": contact_data.get("country", "UK"),
        "updated_at": datetime.utcnow()
    }
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {k: v for k, v in update_fields.items() if v}}
    )
    
    return {"message": "Contact information updated"}

@router.post("/profile/preferences")
async def update_preferences(
    current_user: dict = Depends(get_current_user),
    preferences_data: dict = Body(...)
):
    """Update user preferences"""
    user = await db.users.find_one({"_id": current_user["_id"]})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_fields = {
        "language": preferences_data.get("language", "en"),
        "timezone": preferences_data.get("timezone", "GMT"),
        "notification_email": preferences_data.get("notification_email", True),
        "notification_batch": preferences_data.get("notification_batch", True),
        "notification_alerts": preferences_data.get("notification_alerts", True),
        "notification_weekly_reports": preferences_data.get("notification_weekly_reports", False),
        "updated_at": datetime.utcnow()
    }
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": update_fields}
    )
    
    return {"message": "Preferences updated"}

@router.get("/logout")
@router.post("/logout")
async def logout(request: Request):
    """Logout and clear auth cookies"""
    access_token = request.cookies.get("access_token")
    refresh_token = request.cookies.get("refresh_token")
    auth_header = request.headers.get("authorization")
    if not access_token and auth_header and auth_header.lower().startswith("bearer "):
        access_token = auth_header.split(" ", 1)[1].strip()

    if access_token:
        await db.sessions.delete_many({"access_token": access_token})
    if refresh_token:
        await db.sessions.delete_many({"refresh_token": refresh_token})

    if request.method == 'POST':
        response = JSONResponse({"message": "Logged out successfully"})
    else:
        response = RedirectResponse(url="/", status_code=302)

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response