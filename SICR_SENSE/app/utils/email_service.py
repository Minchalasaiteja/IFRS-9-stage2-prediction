import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import List, Optional, Dict
from jinja2 import Environment, FileSystemLoader
from pathlib import Path
from ..config import settings
import logging
import aiosmtplib
from datetime import datetime

logger = logging.getLogger(__name__)

# Email templates
templates_dir = Path(__file__).parent.parent.parent / "templates" / "email"
env = Environment(loader=FileSystemLoader(str(templates_dir)))

class EmailService:
    @staticmethod
    async def send_email(
        to_email: str,
        subject: str,
        template_name: str,
        context: Dict = {},
        attachments: List[Dict] = []
    ):
        """Send email using SMTP"""
        try:
            # Create message
            message = MIMEMultipart("alternative")
            message["From"] = f"SICRSense <{settings.SMTP_FROM}>"
            message["To"] = to_email
            message["Subject"] = subject
            message["Date"] = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000")
            message["Message-ID"] = f"<{datetime.utcnow().timestamp()}@sicrsense.com>"
            
            # Render template
            template = env.get_template(f"{template_name}.html")
            html_content = template.render(**context)
            message.attach(MIMEText(html_content, "html"))
            
            # Add attachments
            for attachment in attachments:
                with open(attachment["path"], "rb") as f:
                    part = MIMEApplication(f.read(), Name=attachment["filename"])
                    part["Content-Disposition"] = f'attachment; filename="{attachment["filename"]}"'
                    message.attach(part)
            
            # Send email
            # Replace the aiosmtplib.send block with dynamic port handling
            # If SMTP credentials are not configured, fallback to logging the email to a file
            if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
                log_path = Path('logs') / 'email_fallback.log'
                try:
                    log_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(f"\n--- EMAIL FALLBACK ({datetime.utcnow().isoformat()}) ---\n")
                        f.write(f"To: {to_email}\nSubject: {subject}\nTemplate: {template_name}\nContext: {context}\n\n")
                except Exception as e:
                    logger.error(f"Failed to write email fallback log: {e}")
                logger.info(f"Email fallback used for {to_email}")
                return True

            await aiosmtplib.send(
                message,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                use_tls=(settings.SMTP_PORT == 465),
                start_tls=(settings.SMTP_PORT == 587),
            )
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False
    
    @staticmethod
    async def send_verification_email(email: str, verification_token: str, username: str):
        """Send email verification"""
        verification_url = f"https://sicrsense.com/verify-email?token={verification_token}"
        return await EmailService.send_email(
            to_email=email,
            subject="Verify Your SICRSense Account",
            template_name="verify_email",
            context={
                "username": username,
                "verification_url": verification_url,
                "expiry_hours": 24
            }
        )
    
    @staticmethod
    async def send_password_reset(email: str, reset_token: str, username: str):
        """Send password reset email"""
        reset_url = f"https://sicrsense.com/reset-password?token={reset_token}"
        return await EmailService.send_email(
            to_email=email,
            subject="Reset Your SICRSense Password",
            template_name="reset_password",
            context={
                "username": username,
                "reset_url": reset_url,
                "expiry_minutes": 30
            }
        )
    
    @staticmethod
    async def send_2fa_notification(email: str, username: str, action: str, ip_address: str = "Unknown IP"):
        """Notify user about 2FA changes"""
        return await EmailService.send_email(
            to_email=email,
            subject="Security Alert: Two-Factor Authentication Updated",
            template_name="security_alert",
            context={
                "username": username,
                "action": action,
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "ip_address": ip_address
            }
        )