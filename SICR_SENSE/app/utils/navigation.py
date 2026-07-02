"""
Navigation and routing helpers
"""

from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class NavItem:
    """Navigation item"""
    label: str
    url: str
    icon: str
    badge: Optional[str] = None
    badge_color: Optional[str] = None
    children: Optional[List['NavItem']] = None
    required_role: Optional[str] = None
    external: bool = False

def get_main_navigation(user_role: str = "user") -> List[NavItem]:
    """Get main navigation items based on user role"""
    nav_items = [
        NavItem(
            label="Dashboard",
            url="/dashboard",
            icon="fa-th-large",
            children=[
                NavItem(label="Overview", url="/dashboard", icon="fa-home"),
                NavItem(label="Predictions", url="/dashboard#predict", icon="fa-brain"),
                NavItem(label="Batch Process", url="/dashboard#batch", icon="fa-layer-group"),
            ]
        ),
        NavItem(
            label="Live Monitoring",
            url="/monitoring",
            icon="fa-chart-line",
            children=[
                NavItem(label="Overview", url="/monitoring", icon="fa-satellite-dish"),
                NavItem(label="Performance", url="/monitoring#performance", icon="fa-tachometer-alt"),
                NavItem(label="Risk Analysis", url="/monitoring#risk", icon="fa-shield-haltered"),
                NavItem(label="Resources", url="/monitoring#resources", icon="fa-server"),
            ]
        ),
        NavItem(
            label="IFRS 9 Workflow",
            url="/ifrs9-workflow",
            icon="fa-diagram-project",
        ),
        NavItem(
            label="Reports",
            url="/reports",
            icon="fa-file-pdf",
            badge="New",
            badge_color="cyan"
        ),
    ]
    
    # Admin-only items
    if user_role == "admin":
        nav_items.append(
            NavItem(
                label="Administration",
                url="/admin",
                icon="fa-shield-haltered",
                children=[
                    NavItem(label="Admin Dashboard", url="/admin", icon="fa-th-large"),
                    NavItem(label="User Management", url="/admin#users", icon="fa-users"),
                    NavItem(label="Activity Logs", url="/admin#activity", icon="fa-history"),
                    NavItem(label="Security", url="/admin#security", icon="fa-lock"),
                    NavItem(label="Audit Trail", url="/admin#audit", icon="fa-clipboard-list"),
                ]
            )
        )
    
    # Settings
    nav_items.append(
        NavItem(
            label="Settings",
            url="/settings",
            icon="fa-cog",
            children=[
                NavItem(label="Profile", url="/profile", icon="fa-user"),
                NavItem(label="Account", url="/settings", icon="fa-cog"),
                
                
            ]
        )
    )
    
    return nav_items

def get_breadcrumbs(path: str) -> List[Dict]:
    """Generate breadcrumbs from URL path"""
    breadcrumbs = [{"label": "Home", "url": "/", "icon": "home"}]
    
    path_parts = path.strip("/").split("/")
    current_path = ""
    
    breadcrumb_map = {
        "dashboard": {"label": "Dashboard", "icon": "th-large"},
        "monitoring": {"label": "Live Monitoring", "icon": "chart-line"},
        "ifrs9-workflow": {"label": "IFRS 9 Workflow", "icon": "diagram-project"},
        "admin": {"label": "Admin Panel", "icon": "shield-haltered"},
        "profile": {"label": "Profile", "icon": "user"},
        "settings": {"label": "Settings", "icon": "cog"},
        "reports": {"label": "Reports", "icon": "file-pdf"},
        "predictions": {"label": "Predictions", "icon": "brain"},
        "users": {"label": "User Management", "icon": "users"},
    }
    
    for part in path_parts:
        if part:
            current_path += f"/{part}"
            if part in breadcrumb_map:
                breadcrumbs.append({
                    "label": breadcrumb_map[part]["label"],
                    "url": current_path,
                    "icon": breadcrumb_map[part]["icon"]
                })
            else:
                breadcrumbs.append({
                    "label": part.replace("-", " ").title(),
                    "url": current_path
                })
    
    return breadcrumbs