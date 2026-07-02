from fastapi import WebSocket, WebSocketDisconnect, HTTPException
from typing import List, Dict, Any, Set, Optional
import json
import asyncio
import logging
from datetime import datetime, timedelta
from collections import defaultdict
import time
import psutil
import os
from jose import jwt, JWTError
from bson import ObjectId

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Enhanced WebSocket Manager with real-time metrics streaming"""
    
    def __init__(self):
        # Connection pools by type
        self.active_connections: Set[WebSocket] = set()
        self.prediction_subscribers: Set[WebSocket] = set()
        self.metrics_subscribers: Set[WebSocket] = set()
        self.admin_subscribers: Set[WebSocket] = set()
        
        # User-specific connections
        self.user_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        
        # Connection metadata
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}
        
        # Statistics
        self.connection_stats: Dict[str, Any] = {
            "total_connections": 0,
            "total_disconnections": 0,
            "active_connections": 0,
            "messages_sent": 0,
            "messages_received": 0,
            "peak_connections": 0,
            "connection_duration_total": 0
        }
        
        # Real-time metrics cache
        self.metrics_cache: Dict[str, Any] = {
            "prediction_rate": [],
            "latency_data": [],
            "error_rate": 0,
            "active_users": 0,
            "system_metrics": {}
        }
        
        # Background tasks
        self.background_tasks: Set[asyncio.Task] = set()
        self.metrics_broadcast_task: Optional[asyncio.Task] = None
        self.system_metrics_task: Optional[asyncio.Task] = None
        
        # Database reference (will be set later)
        self.db = None
        
        # Background tasks will be started lazily or during startup
    
    def set_database(self, db):
        """Set database reference"""
        self.db = db
    
    def start_background_tasks(self):
        """Start background tasks for metrics collection and broadcasting"""
        try:
            if self.metrics_broadcast_task is None or self.metrics_broadcast_task.done():
                self.metrics_broadcast_task = asyncio.create_task(self.broadcast_metrics_loop())
                self.background_tasks.add(self.metrics_broadcast_task)
            
            if self.system_metrics_task is None or self.system_metrics_task.done():
                self.system_metrics_task = asyncio.create_task(self.collect_system_metrics())
                self.background_tasks.add(self.system_metrics_task)
        except RuntimeError:
            logger.debug("Could not start background tasks: no running event loop")
    
    # ============================================================
    # FIX 1: AUTHENTICATE METHOD - Improved with better error handling
    # ============================================================
    async def authenticate(self, token: Optional[str] = None) -> Optional[Dict]:
        """Authenticate WebSocket connection using JWT token"""
        if not token:
            logger.warning("WebSocket authentication: No token provided")
            return None
        
        if not self.db:
            logger.warning("WebSocket authentication: Database not initialized")
            return None
        
        try:
            # Strip "Bearer " prefix if frontend accidentally included it
            if token.lower().startswith("bearer "):
                token = token.split(" ", 1)[1]
                logger.debug("WebSocket authentication: Stripped Bearer prefix")

            # Import JWTHandler
            from .auth.jwt_handler import JWTHandler

            # Decode token
            try:
                payload = JWTHandler.decode_token(token)
            except HTTPException as exc:
                logger.warning(f"WebSocket authentication failed: {exc.detail}")
                return None

            if not payload:
                logger.warning("WebSocket authentication: Invalid token payload")
                return None

            user_id = payload.get("sub")
            if not user_id:
                logger.warning("WebSocket authentication: No user ID in token")
                return None

            user_id = str(user_id).strip()
            logger.debug(f"WebSocket authentication: User ID from token: {user_id}")

            # Handle ObjectId conversion
            try:
                if ObjectId.is_valid(user_id):
                    obj_id = ObjectId(user_id)
                else:
                    obj_id = user_id
            except Exception as e:
                logger.error(f"WebSocket authentication: ObjectId conversion error: {e}")
                obj_id = user_id

            # Find user in database by _id or fallback by username/email
            user = await self.db.users.find_one({"_id": obj_id})
            if not user and obj_id != user_id:
                user = await self.db.users.find_one({"_id": user_id})
            if not user and payload.get("username"):
                user = await self.db.users.find_one({"username": payload.get("username")})
            if not user and payload.get("email"):
                user = await self.db.users.find_one({"email": payload.get("email")})

            if user:
                user["_id"] = str(user["_id"])
                logger.info(f"WebSocket authenticated user: {user.get('username', 'Unknown')} (role: {user.get('role', 'user')})")
                return user

            logger.warning(f"WebSocket authentication: User not found for token subject: {user_id}")
            return None

        except Exception as e:
            logger.error(f"WebSocket authentication failed: {e}")
            return None
    
    # ============================================================
    # FIX 2: CONNECT METHOD - Better error handling
    # ============================================================
    async def connect(self, websocket: WebSocket, token: Optional[str] = None):
        """Accept new WebSocket connection with authentication"""
        # Ensure background tasks are running
        self.start_background_tasks()
        
        # Authenticate user
        user = await self.authenticate(token)
        
        # If authentication fails, reject connection
        if not user:
            logger.warning(f"WebSocket connection rejected: Authentication failed")
            try:
                await websocket.close(code=1008, reason="Authentication required")
            except Exception as e:
                logger.debug(f"Error closing websocket on auth failure: {e}")
            # Raise disconnect to stop execution
            raise WebSocketDisconnect(code=1008, reason="Authentication required")
        
        # Accept the WebSocket connection
        try:
            await websocket.accept()
        except Exception as e:
            logger.error(f"WebSocket accept failed: {e}")
            raise WebSocketDisconnect(code=1011, reason="Failed to accept connection")
        
        # Add to connection pools
        self.active_connections.add(websocket)
        
        # Store metadata
        self.connection_metadata[websocket] = {
            "connected_at": datetime.utcnow(),
            "user": user,
            "user_id": user.get("_id"),
            "subscriptions": set(),
            "messages_sent": 0,
            "messages_received": 0,
            "last_activity": datetime.utcnow()
        }
        
        # Add to user connections
        user_id = user.get("_id")
        if user_id:
            self.user_connections[user_id].add(websocket)
            logger.info(f"User {user.get('username', 'Unknown')} connected via WebSocket")
        
        # Update statistics
        self.connection_stats["total_connections"] += 1
        self.connection_stats["active_connections"] = len(self.active_connections)
        self.connection_stats["peak_connections"] = max(
            self.connection_stats["peak_connections"],
            self.connection_stats["active_connections"]
        )
        
        # Send connection confirmation
        try:
            await self.send_personal_message({
                "type": "connection_established",
                "timestamp": datetime.utcnow().isoformat(),
                "message": "Connected to SICRSense real-time feed",
                "connection_id": id(websocket),
                "system_status": self.get_system_status(),
                "features": {
                    "prediction_streaming": True,
                    "metrics_streaming": True,
                    "admin_monitoring": user.get("role") == "admin",
                    "max_reconnect_timeout": 30
                }
            }, websocket)
        except Exception as e:
            logger.error(f"Failed to send connection confirmation: {e}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection and clean up"""
        # Remove from all pools
        self.active_connections.discard(websocket)
        self.prediction_subscribers.discard(websocket)
        self.metrics_subscribers.discard(websocket)
        self.admin_subscribers.discard(websocket)
        
        # Remove from user connections
        metadata = self.connection_metadata.get(websocket, {})
        user_id = metadata.get("user_id")
        if user_id and user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]
        
        # Calculate connection duration
        if "connected_at" in metadata:
            duration = (datetime.utcnow() - metadata["connected_at"]).total_seconds()
            self.connection_stats["connection_duration_total"] += duration
        
        # Update statistics
        self.connection_stats["total_disconnections"] += 1
        self.connection_stats["active_connections"] = len(self.active_connections)
        
        # Clean up metadata
        if websocket in self.connection_metadata:
            del self.connection_metadata[websocket]
        
        # Update Prometheus metrics if available
        try:
            from .monitoring import metrics_manager
            metrics_manager.update_active_connections(self.connection_stats["active_connections"])
        except:
            pass
        
        logger.info(f"WebSocket disconnected. Active: {self.connection_stats['active_connections']}")
    
    async def handle_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        try:
            # Update activity timestamp
            if websocket in self.connection_metadata:
                self.connection_metadata[websocket]["last_activity"] = datetime.utcnow()
                self.connection_metadata[websocket]["messages_received"] += 1
            
            self.connection_stats["messages_received"] += 1
            
            message_type = message.get("type")
            
            if message_type == "subscribe_predictions":
                await self.subscribe_to_predictions(websocket)
                
            elif message_type == "subscribe_metrics":
                await self.subscribe_to_metrics(websocket)
                
            elif message_type == "subscribe_admin":
                await self.subscribe_to_admin(websocket)
                
            elif message_type == "unsubscribe":
                await self.unsubscribe_all(websocket)
                
            elif message_type == "ping":
                await self.send_personal_message({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat(),
                    "server_time": time.time(),
                    "active_connections": self.connection_stats["active_connections"]
                }, websocket)
                
            elif message_type == "request_metrics":
                await self.send_personal_message({
                    "type": "metrics_snapshot",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": self.metrics_cache
                }, websocket)
                
            elif message_type == "request_system_info":
                await self.send_personal_message({
                    "type": "system_info",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": self.get_system_status()
                }, websocket)
                
            else:
                await self.send_personal_message({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }, websocket)
                
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
            await self.send_personal_message({
                "type": "error",
                "message": str(e)
            }, websocket)
    
    async def subscribe_to_predictions(self, websocket: WebSocket):
        """Subscribe to real-time prediction updates"""
        self.prediction_subscribers.add(websocket)
        
        if websocket in self.connection_metadata:
            self.connection_metadata[websocket]["subscriptions"].add("predictions")
        
        await self.send_personal_message({
            "type": "subscription_confirmed",
            "channel": "predictions",
            "message": "Subscribed to real-time prediction updates"
        }, websocket)
        
        logger.info(f"Client subscribed to predictions (Total: {len(self.prediction_subscribers)})")
    
    async def subscribe_to_metrics(self, websocket: WebSocket):
        """Subscribe to real-time metrics updates"""
        self.metrics_subscribers.add(websocket)
        
        if websocket in self.connection_metadata:
            self.connection_metadata[websocket]["subscriptions"].add("metrics")
        
        # Send current metrics snapshot
        await self.send_personal_message({
            "type": "metrics_snapshot",
            "timestamp": datetime.utcnow().isoformat(),
            "data": self.metrics_cache
        }, websocket)
        
        await self.send_personal_message({
            "type": "subscription_confirmed",
            "channel": "metrics",
            "message": "Subscribed to real-time metrics updates"
        }, websocket)
        
        logger.info(f"Client subscribed to metrics (Total: {len(self.metrics_subscribers)})")
    
    async def subscribe_to_admin(self, websocket: WebSocket):
        """Subscribe to admin monitoring updates (admin only)"""
        metadata = self.connection_metadata.get(websocket, {})
        user = metadata.get("user", {})
        
        if not user or user.get("role") != "admin":
            await self.send_personal_message({
                "type": "error",
                "message": "Admin access required"
            }, websocket)
            return
        
        self.admin_subscribers.add(websocket)
        
        if websocket in self.connection_metadata:
            self.connection_metadata[websocket]["subscriptions"].add("admin")
        
        await self.send_personal_message({
            "type": "subscription_confirmed",
            "channel": "admin",
            "message": "Subscribed to admin monitoring updates"
        }, websocket)
        
        logger.info(f"Admin subscribed to monitoring (Total: {len(self.admin_subscribers)})")
    
    async def unsubscribe_all(self, websocket: WebSocket):
        """Unsubscribe from all channels"""
        self.prediction_subscribers.discard(websocket)
        self.metrics_subscribers.discard(websocket)
        self.admin_subscribers.discard(websocket)
        
        if websocket in self.connection_metadata:
            self.connection_metadata[websocket]["subscriptions"].clear()
        
        await self.send_personal_message({
            "type": "unsubscribed",
            "message": "Unsubscribed from all channels"
        }, websocket)
    
    async def broadcast_prediction(self, prediction_data: Dict[str, Any]):
        """Broadcast prediction result to subscribed clients"""
        message = {
            "type": "prediction_update",
            "timestamp": datetime.utcnow().isoformat(),
            "data": prediction_data
        }
        
        await self.broadcast_to_subscribers(message, self.prediction_subscribers)
        
        # Update metrics cache
        self.metrics_cache["prediction_rate"].append({
            "timestamp": datetime.utcnow().isoformat(),
            "risk_tier": prediction_data.get("risk_tier"),
            "probability": prediction_data.get("migration_probability"),
            "latency": prediction_data.get("processing_time_ms")
        })
        
        # Keep only last 100 predictions in cache
        if len(self.metrics_cache["prediction_rate"]) > 100:
            self.metrics_cache["prediction_rate"] = self.metrics_cache["prediction_rate"][-100:]
    
    async def broadcast_metrics_update(self, metrics_data: Dict[str, Any]):
        """Broadcast metrics update to subscribed clients"""
        message = {
            "type": "metrics_update",
            "timestamp": datetime.utcnow().isoformat(),
            "data": metrics_data
        }
        
        await self.broadcast_to_subscribers(message, self.metrics_subscribers)
    
    async def broadcast_admin_update(self, admin_data: Dict[str, Any]):
        """Broadcast admin monitoring data"""
        message = {
            "type": "admin_update",
            "timestamp": datetime.utcnow().isoformat(),
            "data": admin_data
        }
        
        await self.broadcast_to_subscribers(message, self.admin_subscribers)
    
    async def broadcast_to_subscribers(self, message: Dict[str, Any], subscribers: Set[WebSocket]):
        """Broadcast message to a specific set of subscribers"""
        disconnected = set()
        
        for websocket in subscribers:
            try:
                await websocket.send_json(message)
                
                if websocket in self.connection_metadata:
                    self.connection_metadata[websocket]["messages_sent"] += 1
                
                self.connection_stats["messages_sent"] += 1
                
            except Exception as e:
                logger.error(f"Failed to send to subscriber: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected subscribers
        for websocket in disconnected:
            self.disconnect(websocket)
    
    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """Send message to specific client"""
        try:
            await websocket.send_json(message)
            
            if websocket in self.connection_metadata:
                self.connection_metadata[websocket]["messages_sent"] += 1
            
            self.connection_stats["messages_sent"] += 1
            
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")
            self.disconnect(websocket)
    
    async def broadcast_metrics_loop(self):
        """Background task to broadcast metrics periodically"""
        while True:
            try:
                await asyncio.sleep(5)  # Broadcast every 5 seconds
                
                # Check if we have subscribers
                if not self.metrics_subscribers and not self.admin_subscribers:
                    continue
                
                # Prepare metrics update
                metrics_update = {
                    "active_connections": self.connection_stats["active_connections"],
                    "total_connections": self.connection_stats["total_connections"],
                    "messages_sent": self.connection_stats["messages_sent"],
                    "prediction_subscribers": len(self.prediction_subscribers),
                    "metrics_subscribers": len(self.metrics_subscribers),
                    "admin_subscribers": len(self.admin_subscribers),
                    "active_users": len(self.user_connections),
                    "system_metrics": self.metrics_cache.get("system_metrics", {}),
                    "total_predictions": len(self.metrics_cache.get("prediction_rate", [])),
                    "avg_latency_ms": round(
                        sum((item.get("latency") or 0) for item in self.metrics_cache.get("prediction_rate", [])) /
                        max(1, len(self.metrics_cache.get("prediction_rate", [])))
                    ),
                    "prediction_rate": self.metrics_cache.get("prediction_rate", [])[-10:]  # Last 10
                }
                
                # Broadcast to metrics subscribers
                if self.metrics_subscribers:
                    await self.broadcast_metrics_update(metrics_update)
                
                # Broadcast to admin subscribers
                if self.admin_subscribers:
                    admin_update = {
                        **metrics_update,
                        "user_details": {
                            user_id: len(connections)
                            for user_id, connections in self.user_connections.items()
                        },
                        "connection_details": [
                            {
                                "connection_id": id(ws),
                                "connected_at": meta.get("connected_at", datetime.utcnow()).isoformat(),
                                "user": meta.get("user", {}).get("username", "Anonymous"),
                                "subscriptions": list(meta.get("subscriptions", [])),
                                "messages_sent": meta.get("messages_sent", 0)
                            }
                            for ws, meta in list(self.connection_metadata.items())[:10]  # Limit to 10
                        ]
                    }
                    await self.broadcast_admin_update(admin_update)
                
                # Clean up old metrics data
                cutoff_time = datetime.utcnow() - timedelta(hours=1)
                self.metrics_cache["prediction_rate"] = [
                    p for p in self.metrics_cache["prediction_rate"]
                    if datetime.fromisoformat(p["timestamp"]) > cutoff_time
                ]
                
            except Exception as e:
                logger.error(f"Error in metrics broadcast loop: {e}")
    
    async def collect_system_metrics(self):
        """Background task to collect system performance metrics"""
        while True:
            try:
                await asyncio.sleep(10)  # Collect every 10 seconds
                
                # Collect system metrics
                cpu_percent = psutil.cpu_percent(interval=None)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                net_io = psutil.net_io_counters()
                
                system_metrics = {
                    "timestamp": datetime.utcnow().isoformat(),
                    "cpu": {
                        "percent": cpu_percent,
                        "cores": psutil.cpu_count()
                    },
                    "memory": {
                        "total_gb": round(memory.total / (1024**3), 2),
                        "used_gb": round(memory.used / (1024**3), 2),
                        "percent": memory.percent
                    },
                    "disk": {
                        "total_gb": round(disk.total / (1024**3), 2),
                        "used_gb": round(disk.used / (1024**3), 2),
                        "percent": disk.percent
                    },
                    "network": {
                        "bytes_sent_mb": round(net_io.bytes_sent / (1024**2), 2),
                        "bytes_recv_mb": round(net_io.bytes_recv / (1024**2), 2)
                    },
                    "process": {
                        "pid": os.getpid(),
                        "threads": psutil.Process().num_threads(),
                        "memory_mb": round(psutil.Process().memory_info().rss / (1024**2), 2)
                    }
                }
                
                self.metrics_cache["system_metrics"] = system_metrics
                
                # Calculate error rate (simplified)
                recent_predictions = self.metrics_cache["prediction_rate"]
                if recent_predictions:
                    errors = sum(1 for p in recent_predictions if p.get("error"))
                    total = len(recent_predictions)
                    self.metrics_cache["error_rate"] = (errors / total) * 100 if total > 0 else 0
                
                # Update system metrics in Prometheus
                try:
                    from .monitoring import metrics_manager
                    metrics_manager.update_system_metrics()
                except:
                    pass
                
            except Exception as e:
                logger.error(f"Error collecting system metrics: {e}")
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get current system status"""
        try:
            return {
                "status": "healthy" if self.connection_stats["active_connections"] > 0 else "idle",
                "uptime_seconds": time.time() - psutil.boot_time(),
                "active_connections": self.connection_stats["active_connections"],
                "peak_connections": self.connection_stats["peak_connections"],
                "total_messages_processed": self.connection_stats["messages_sent"] + self.connection_stats["messages_received"],
                "active_subscriptions": {
                    "predictions": len(self.prediction_subscribers),
                    "metrics": len(self.metrics_subscribers),
                    "admin": len(self.admin_subscribers)
                },
                "memory_usage": f"{psutil.Process().memory_percent():.1f}%"
            }
        except:
            return {
                "status": "unknown",
                "active_connections": self.connection_stats["active_connections"],
                "active_subscriptions": {
                    "predictions": len(self.prediction_subscribers),
                    "metrics": len(self.metrics_subscribers),
                    "admin": len(self.admin_subscribers)
                }
            }
    
    async def cleanup(self):
        """Clean up resources on shutdown"""
        # Cancel background tasks
        for task in self.background_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        # Close all connections
        for websocket in self.active_connections.copy():
            try:
                await websocket.close(code=1001, reason="Server shutting down")
            except:
                pass
            self.disconnect(websocket)
        
        logger.info("WebSocket manager cleaned up")
    
    def get_user_connections(self, user_id: str) -> Set[WebSocket]:
        """Get all connections for a specific user"""
        return self.user_connections.get(user_id, set())
    
    async def send_to_user(self, user_id: str, message: Dict[str, Any]):
        """Send message to all connections of a specific user"""
        user_connections = self.get_user_connections(user_id)
        for websocket in user_connections:
            await self.send_personal_message(message, websocket)
    
    async def broadcast_system_alert(self, alert_data: Dict[str, Any]):
        """Broadcast system alert to all connected clients"""
        message = {
            "type": "system_alert",
            "timestamp": datetime.utcnow().isoformat(),
            "severity": alert_data.get("severity", "info"),
            "message": alert_data.get("message", ""),
            "data": alert_data
        }
        
        await self.broadcast_to_subscribers(message, self.active_connections)

# Global WebSocket manager instance
ws_manager = WebSocketManager()