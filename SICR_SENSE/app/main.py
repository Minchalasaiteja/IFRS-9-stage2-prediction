"""
SICRSense Main Application - Simplified Working Version
"""
import os
import logging
from datetime import datetime
from pathlib import Path
from bson import ObjectId

from fastapi import FastAPI, Request, Depends, WebSocket, WebSocketDisconnect, BackgroundTasks, Query, Cookie
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import Optional

from app.websocket_handler import ws_manager
from .database import db
from .config import settings
from .auth.jwt_handler import JWTHandler
from .database import Database

# Setup logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise IFRS 9 SICR Platform",
    version=settings.APP_VERSION,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
if Path("static").exists():
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Middleware to log unhandled exceptions during request processing
@app.middleware("http")
async def log_exceptions_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception(f"Unhandled exception during request: {request.method} {request.url.path}")
        raise

# Templates
templates = Jinja2Templates(directory="templates")

# Startup time
startup_time = datetime.now()

# Track if background tasks have been started
ws_background_tasks_started = False

# Import and include routers
try:
    from .routes import auth
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
except ImportError as e:
    logger.error(f"Failed to import auth router: {e}")

try:
    from .routes import admin
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
except ImportError as e:
    logger.error(f"Failed to import admin router: {e}")

try:
    from .routes import monitoring
    app.include_router(monitoring.router, prefix="/api/v1/monitoring", tags=["monitoring"])
except ImportError as e:
    logger.warning(f"Failed to import monitoring router (it might not exist yet): {e}")

try:
    from .routes import reports
    app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
except ImportError as e:
    logger.warning(f"Failed to import reports router: {e}")

# ============================================================
# FIX: Corrected import path - added the dot for relative import
# ============================================================
try:
    from .routes import utils  # <--- Changed from 'from routes import utils'
    app.include_router(utils.router, prefix="/api/v1", tags=["utility"])
except ImportError as e:
    logger.warning(f"Failed to import utility router: {e}")

try:
    from .routes import predictions
    app.include_router(predictions.router, prefix="/api/v1/predictions", tags=["predictions"])
    
    # Also we need to initialize the global model service inside predictions router
    from .model_service import IFRS9ModelService
    model_service = IFRS9ModelService()
    predictions.set_model_service(model_service)
except ImportError as e:
    logger.error(f"Failed to import predictions router: {e}")
    model_service = None

@app.on_event("startup")
async def startup_event():
    """Application startup events"""
    logger.info("Initializing database connection...")
    await Database.connect_db()
    
    # Set database reference for WebSocket manager
    ws_manager.set_database(db)
    
    logger.info("Starting WebSocket background tasks...")
    ws_manager.start_background_tasks()
    
    # Create database indexes if needed
    try:
        await db.predictions.create_index("timestamp")
        await db.predictions.create_index("output.risk_tier")
        await db.audit_logs.create_index("timestamp")
        logger.info("Database indexes created")
    except Exception as e:
        logger.warning(f"Could not create indexes: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown events"""
    logger.info("Closing database connection...")
    await Database.close_db()
    await ws_manager.cleanup()


def parse_object_id(value: str):
    if not value:
        return None
    try:
        return ObjectId(value)
    except Exception:
        return value

async def get_optional_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
    if not token:
        return None
    try:
        payload = JWTHandler.decode_token(token)
        user_id = payload.get("sub")
        if user_id:
            user = await db.users.find_one({"_id": parse_object_id(user_id)})
            if user and "_id" in user:
                user["_id"] = str(user["_id"])
            return user
    except Exception:
        return None

# ==============================
# Frontend Page Routes
# ==============================

@app.get("/", response_class=HTMLResponse)
async def landing_page(request: Request):
    """Landing page"""
    user = await get_optional_user(request)
    return templates.TemplateResponse(request, "index_v1.html", {
        "request": request,
        "title": "SICRSense - Enterprise IFRS 9 Intelligence",
        "year": datetime.now().year,
        "active_page": "home",
        "user": user
    })

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Login page"""
    user = await get_optional_user(request)
    if user:
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "auth/login_v1.html", {
        "request": request,
        "title": "Sign In - SICRSense",
        "active_page": "login"
    })

@app.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    """Signup page"""
    user = await get_optional_user(request)
    if user:
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "auth/signup_v1.html", {
        "request": request,
        "title": "Create Account - SICRSense",
        "active_page": "signup"
    })

@app.get("/reset-password", response_class=HTMLResponse)
async def reset_password_page(request: Request):
    """Password reset page"""
    return templates.TemplateResponse(request, "auth/reset-password.html", {
        "request": request,
        "title": "Reset Password - SICRSense"
    })

@app.get("/verify-email", response_class=HTMLResponse)
async def verify_email_page(request: Request):
    """Email verification page"""
    return templates.TemplateResponse(request, "auth/verify-email.html", {
        "request": request,
        "title": "Verify Email - SICRSense"
    })

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    """Main dashboard"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/index.html", {
        "request": request,
        "title": "Dashboard - SICRSense",
        "model_version": "3.0.0",
        "active_page": "dashboard",
        "user": user
    })

@app.get("/monitoring", response_class=HTMLResponse)
async def monitoring_page(request: Request):
    """Monitoring dashboard"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/monitoring.html", {
        "request": request,
        "title": "Live Monitoring - SICRSense",
        "active_page": "monitoring",
        "user": user
    })

@app.get("/ifrs9-workflow", response_class=HTMLResponse)
async def workflow_page(request: Request):
    """IFRS 9 Workflow page"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/ifrs9_workflow_v1.html", {
        "request": request,
        "title": "IFRS 9 Visual Workflow - SICRSense",
        "active_page": "workflow",
        "user": user
    })

@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    """Admin panel"""
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "admin/dashboard.html", {
        "request": request,
        "title": "Admin Panel - SICRSense",
        "active_page": "admin",
        "admin_section": "overview",
        "user": user
    })

@app.get("/admin/users", response_class=HTMLResponse)
async def admin_users_page(request: Request):
    """Admin user management page"""
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "admin/dashboard.html", {
        "request": request,
        "title": "Admin Users - SICRSense",
        "active_page": "users",
        "admin_section": "users",
        "user": user
    })

@app.get("/admin/audit", response_class=HTMLResponse)
async def admin_audit_page(request: Request):
    """Admin audit logs page"""
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "admin/dashboard.html", {
        "request": request,
        "title": "Audit Logs - SICRSense",
        "active_page": "audit",
        "admin_section": "audit",
        "user": user
    })

@app.get("/admin/activity", response_class=HTMLResponse)
async def admin_activity_page(request: Request):
    """Admin user activity page"""
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "admin/dashboard.html", {
        "request": request,
        "title": "User Activity - SICRSense",
        "active_page": "activity",
        "admin_section": "activity",
        "user": user
    })

@app.get("/admin/sessions", response_class=HTMLResponse)
async def admin_sessions_page(request: Request):
    """Admin sessions page"""
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "admin/dashboard.html", {
        "request": request,
        "title": "Active Sessions - SICRSense",
        "active_page": "sessions",
        "admin_section": "sessions",
        "user": user
    })

@app.get("/admin/security", response_class=HTMLResponse)
async def admin_security_page(request: Request):
    """Admin security settings page"""
    user = await get_optional_user(request)
    if not user or user.get("role") != "admin":
        return RedirectResponse(url="/dashboard", status_code=302)
    return templates.TemplateResponse(request, "admin/dashboard.html", {
        "request": request,
        "title": "Security Settings - SICRSense",
        "active_page": "security",
        "admin_section": "security",
        "user": user
    })

@app.get("/profile", response_class=HTMLResponse)
async def profile_page(request: Request):
    """Profile page"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/profile.html", {
        "request": request,
        "title": "Profile - SICRSense",
        "active_page": "profile",
        "user": user
    })

@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    """Settings page"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/settings.html", {
        "request": request,
        "title": "Settings - SICRSense",
        "active_page": "settings",
        "user": user
    })

@app.get("/reports", response_class=HTMLResponse)
async def reports_page(request: Request):
    """Reports page"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/reports.html", {
        "request": request,
        "title": "Reports - SICRSense",
        "active_page": "reports",
        "user": user
    })

@app.get("/predictions", response_class=HTMLResponse)
async def predictions_page(request: Request):
    """Predictions page"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/predictions.html", {
        "request": request,
        "title": "Predictions - SICRSense",
        "active_page": "predictions",
        "user": user
    })

@app.get("/batch", response_class=HTMLResponse)
async def batch_page(request: Request):
    """Batch processing page"""
    user = await get_optional_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "dashboard/batch.html", {
        "request": request,
        "title": "Batch Processing - SICRSense",
        "active_page": "batch",
        "user": user
    })

@app.get("/docs")
async def docs_redirect():
    return RedirectResponse(url="/api/docs")

@app.get("/redoc")
async def redoc_redirect():
    return RedirectResponse(url="/api/redoc")

@app.get("/api-docs")
async def api_docs_redirect():
    return RedirectResponse(url="/api/docs")

@app.get("/openapi.json")
async def openapi_redirect():
    return RedirectResponse(url="/api/openapi.json")

# ==============================
# API Endpoints (Minimal)
# ==============================

try:
    from .model_service import IFRS9ModelService
    model_service = IFRS9ModelService()
except Exception as e:
    logger.error(f"Could not initialize model service: {e}")
    model_service = None

@app.post("/api/v1/predict")
async def predict_endpoint(request: Request, background_tasks: BackgroundTasks):
    """Prediction endpoint used by the Dashboard UI"""
    import time
    from datetime import datetime
    start_time = time.time()
    if model_service is None:
        return JSONResponse(status_code=503, content={"success": False, "detail": "Prediction service unavailable"})
    data = await request.json()
    loans = data.get("loans")
    if loans is None:
        loans = [data]
    results = model_service.predict(loans)
    latency = time.time() - start_time
    
    user = await get_optional_user(request)
    user_id = str(user["_id"]) if user else "anonymous"

    for i, result in enumerate(results):
        result["processing_time_ms"] = round(latency * 1000, 2)
        result["timestamp"] = datetime.utcnow().isoformat()
        
        # Save to DB via predictions router util
        from .routes.predictions import save_prediction_to_db
        background_tasks.add_task(
            save_prediction_to_db,
            user_id,
            loans[i],
            result,
            latency
        )
        background_tasks.add_task(ws_manager.broadcast_prediction, result)
    return {"success": True, "data": {"predictions": results}}

@app.post("/api/v1/predict/batch")
async def predict_batch_endpoint(request: Request, background_tasks: BackgroundTasks):
    """Batch prediction endpoint"""
    import time
    from datetime import datetime
    start_time = time.time()
    if model_service is None:
        return JSONResponse(status_code=503, content={"success": False, "detail": "Prediction service unavailable"})
    data = await request.json()
    loans = data.get("loans") if isinstance(data, dict) else data
    if not isinstance(loans, list):
        return JSONResponse(status_code=400, content={"success": False, "detail": "Batch payload must be an array of loan objects"})
    results = model_service.predict(loans)
    latency = time.time() - start_time
    
    user = await get_optional_user(request)
    user_id = str(user["_id"]) if user else "anonymous"

    for i, result in enumerate(results):
        result["processing_time_ms"] = round(latency * 1000 / len(results), 2)
        result["timestamp"] = datetime.utcnow().isoformat()
        
        from .routes.predictions import save_prediction_to_db
        background_tasks.add_task(
            save_prediction_to_db,
            user_id,
            loans[i],
            result,
            latency / len(results)
        )
        background_tasks.add_task(ws_manager.broadcast_prediction, result)
    return {"success": True, "data": {"predictions": results}}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    uptime = (datetime.utcnow() - startup_time).total_seconds()
    
    db_status = "not_connected"
    if Database.client:
        try:
            await Database.client.admin.command('ping')
            db_status = "connected"
        except Exception:
            db_status = "error"
            
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
        "uptime_seconds": uptime,
        "services": {
            "database": db_status,
            "model": model_service is not None
        }
    }

@app.get("/api/v1/stats")
async def get_stats():
    """Get basic stats"""
    try:
        from .monitoring import metrics_manager
        daily_preds = metrics_manager.daily_counter
    except ImportError:
        daily_preds = 0
        
    try:
        active_ws = ws_manager.connection_stats.get("active_connections", 0)
    except Exception:
        active_ws = 0
        
    return {
        "daily_predictions": daily_preds,
        "model_version": model_service.model_version if hasattr(model_service, 'model_version') else "simulation",
        "active_websockets": active_ws,
        "uptime_hours": round((datetime.utcnow() - startup_time).total_seconds() / 3600, 2)
    }

# ==============================
# Error Handlers
# ==============================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """Custom 404 handler"""
    logger.error(f"404 handler invoked for path: {request.url.path} - exc: {exc}")
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    
    return templates.TemplateResponse(request, "components/error.html", {
        "request": request,
        "code": "404",
        "title": "Page Not Found",
        "message": "The page you're looking for doesn't exist.",
        "color": "cyan"
    }, status_code=404)

@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    """Custom 500 handler"""
    logger.exception(f"Unhandled exception for path: {request.url.path}")
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=500, content={"detail": "Server error"})
    
    return templates.TemplateResponse(request, "components/error.html", {
        "request": request,
        "code": "500",
        "title": "Server Error",
        "message": "Something went wrong. Please try again.",
        "color": "red"
    }, status_code=500)

# ==============================
# WebSocket Endpoint
# ==============================
@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    access_token: Optional[str] = Cookie(None)
):
    """WebSocket endpoint for real-time updates"""
    # Set database reference if not set
    if not ws_manager.db:
        ws_manager.set_database(db)
    
    # Try to get token from multiple sources
    auth_token = token or access_token
    
    if not auth_token:
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            auth_token = auth_header.split(" ", 1)[1]
    
    logger.info(f"WebSocket connection attempt - Token present: {bool(auth_token)}")
    
    await ws_manager.connect(websocket, auth_token)
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await ws_manager.handle_message(websocket, message)
            except json.JSONDecodeError:
                await ws_manager.send_personal_message({
                    "type": "error",
                    "message": "Invalid JSON format"
                }, websocket)
            except Exception as e:
                logger.error(f"Error processing WebSocket message: {e}")
                
    except WebSocketDisconnect as e:
        logger.info(f"WebSocket disconnected: {e}")
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)