"""Main all-platform router — mounts platform-specific and shared sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.all_platform.routers import (
    seeding_router,
    kpi_router,
    categories_router,
    users_router,
    teams_router,
    auth_router,
    social_accounts_router,
)
from app.modules.all_platform.routers.platforms import router as platforms_router
from app.modules.all_platform.routers.linkedin_auth import router as linkedin_auth_router
from app.modules.all_platform.routers.posts import facebook_posts_router
from app.modules.all_platform.routers.posts_linkedin import linkedin_posts_router
from app.modules.all_platform.routers.posts_unified import router as unified_posts_router
from app.modules.all_platform.routers.groups import facebook_groups_router
from app.modules.all_platform.routers.groups_linkedin import linkedin_groups_router
from app.modules.all_platform.routers.crawl_linkedin import crawl_linkedin_router
from app.modules.all_platform.routers.linkedin_legacy import router as linkedin_legacy_router
from app.modules.all_platform.routers.crawl_facebook import crawl_facebook_router
from app.modules.all_platform.routers.extension_crawl import router as extension_crawl_router
from app.modules.all_platform.routers.fb import router as fb_automation_router
from app.modules.all_platform.routers.websocket import router as websocket_router
from app.modules.all_platform.routers.fb_inbox_accounts import router as fb_inbox_accounts_router
from app.modules.all_platform.routers.customer_lead import router as customer_lead_router

all_platform_router = APIRouter()

# ── Facebook ────────────────────────────────────────────────────────────────────
all_platform_router.include_router(
    seeding_router,
    prefix="/facebook",
    tags=["All-Platform Facebook Seeding"],
)
all_platform_router.include_router(
    facebook_posts_router,
    prefix="/facebook",
    tags=["All-Platform Facebook Posts"],
)
all_platform_router.include_router(
    facebook_groups_router,
    prefix="/facebook",
    tags=["All-Platform Facebook Groups"],
)
all_platform_router.include_router(
    crawl_facebook_router,
    prefix="/facebook",
    tags=["All-Platform Facebook Crawl"],
)
all_platform_router.include_router(
    extension_crawl_router,
    prefix="/extension",
    tags=["All-Platform Extension Crawl"],
)
all_platform_router.include_router(
    fb_automation_router,
    prefix="/fb",
    tags=["All-Platform Facebook Automation"],
)
from app.modules.facebook.src.modules.crawl_fb.router.vps_router import router as vps_fb_router
all_platform_router.include_router(
    vps_fb_router,
    tags=["All-Platform Facebook VPS"],
)

from app.modules.facebook.src.modules.crawl_fb.router.vps import router as vps_vnc_router
all_platform_router.include_router(
    vps_vnc_router,
    tags=["All-Platform Facebook VPS VNC"],
)

# ── LinkedIn ───────────────────────────────────────────────────────────────────
all_platform_router.include_router(
    seeding_router,
    prefix="/linkedin",
    tags=["All-Platform LinkedIn Seeding"],
)
all_platform_router.include_router(
    linkedin_posts_router,
    prefix="/linkedin",
    tags=["All-Platform LinkedIn Posts"],
)
all_platform_router.include_router(
    linkedin_groups_router,
    prefix="/linkedin",
    tags=["All-Platform LinkedIn Groups"],
)
all_platform_router.include_router(
    crawl_linkedin_router,
    prefix="/linkedin",
    tags=["All-Platform LinkedIn Crawl"],
)
all_platform_router.include_router(
    linkedin_auth_router,
    prefix="/linkedin",
    tags=["All-Platform LinkedIn Auth"],
)
all_platform_router.include_router(
    linkedin_legacy_router,
    prefix="/linkedin",
)

# ── Unified Posts (Tong-hop page — no cache, all filters server-side) ──────────
all_platform_router.include_router(
    unified_posts_router,
    prefix="/unified",
    tags=["All-Platform Unified Posts"],
)

# ── KPI (platform-agnostic) ───────────────────────────────────────────────────
all_platform_router.include_router(
    kpi_router,
    prefix="/kpi",
    tags=["All-Platform KPI"],
)

# ── Categories (platform-agnostic) ────────────────────────────────────────────
all_platform_router.include_router(
    categories_router,
    prefix="/categories",
    tags=["All-Platform Categories"],
)

# ── Users & Teams ──────────────────────────────────────────────────────────────
all_platform_router.include_router(
    users_router,
    prefix="/users",
    tags=["All-Platform Users"],
)
all_platform_router.include_router(
    teams_router,
    prefix="/teams",
    tags=["All-Platform Teams"],
)

# ── Auth ─────────────────────────────────────────────────────────────────────
all_platform_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["All-Platform Auth"],
)

# ── Social Accounts ───────────────────────────────────────────────────────────
all_platform_router.include_router(
    social_accounts_router,
    prefix="/social-accounts",
    tags=["All-Platform Social Accounts"],
)

# ── FB Inbox Accounts ──────────────────────────────────────────────────────────
all_platform_router.include_router(
    fb_inbox_accounts_router,
    tags=["All-Platform FB Inbox Accounts"],
)

# ── FB Post KPI ────────────────────────────────────────────────────────────────
from app.modules.all_platform.routers.fb_post_kpi import router as fb_post_kpi_router
all_platform_router.include_router(
    fb_post_kpi_router,
    prefix="/fb/post-kpi",
    tags=["All-Platform FB Post KPI"],
)

# ── Platforms ─────────────────────────────────────────────────────────────────
all_platform_router.include_router(
    platforms_router,
    prefix="/platforms",
    tags=["All-Platform Platforms"],
)

# ── Admin Dashboard ────────────────────────────────────────────────────────────
from app.modules.all_platform.routers.admin_dashboard import router as admin_dashboard_router
all_platform_router.include_router(
    admin_dashboard_router,
    prefix="/admin/dashboard",
    tags=["All-Platform Admin Dashboard"],
)

# ── Customer Leads ─────────────────────────────────────────────────────────────
all_platform_router.include_router(
    customer_lead_router,
    tags=["Customer Leads"]
)

# ── WebSocket ────────────────────────────────────────────────────────────────
all_platform_router.include_router(
    websocket_router,
    tags=["All-Platform WebSockets"]
)

# ── Zalo ───────────────────────────────────────────────────────────────────────
from app.modules.all_platform.zalo.api.routes.auth import router as zalo_auth_router
from app.modules.all_platform.zalo.api.routes.crawler import router as zalo_crawl_router
from app.modules.all_platform.zalo.api.routes.groups import router as zalo_groups_router
from app.modules.all_platform.zalo.api.routes.jobs import router as zalo_jobs_router
from app.modules.all_platform.zalo.api.routes.library import router as zalo_library_router
from app.modules.all_platform.zalo.api.routes.broadcasts import router as zalo_broadcasts_router
from app.modules.all_platform.zalo.api.routes.maintenance import router as zalo_maintenance_router
from app.modules.all_platform.zalo.api.routes.listener import router as zalo_listener_router
from app.modules.all_platform.zalo.api.routes.accounts import router as zalo_accounts_router
from app.modules.all_platform.zalo.api.routes.conversations import router as zalo_conversations_router
from app.modules.all_platform.zalo.api.routes.events import router as zalo_events_router
from app.modules.all_platform.zalo.api.routes.inbox_share import router as zalo_inbox_share_router
from app.modules.all_platform.zalo.api.proxy import router as zalo_proxy_router

all_platform_router.include_router(zalo_auth_router, prefix="/zalo", tags=["Zalo Auth"])
all_platform_router.include_router(zalo_crawl_router, prefix="/zalo", tags=["Zalo Crawl"])
all_platform_router.include_router(zalo_groups_router, prefix="/zalo", tags=["Zalo Groups"])
all_platform_router.include_router(zalo_jobs_router, prefix="/zalo", tags=["Zalo Jobs"])
all_platform_router.include_router(zalo_library_router, prefix="/zalo", tags=["Zalo Library"])
all_platform_router.include_router(zalo_broadcasts_router, prefix="/zalo", tags=["Zalo Broadcasts"])
all_platform_router.include_router(zalo_maintenance_router, prefix="/zalo", tags=["Zalo Maintenance"])
all_platform_router.include_router(zalo_listener_router, prefix="/zalo", tags=["Zalo Listener"])
all_platform_router.include_router(zalo_accounts_router, prefix="/zalo", tags=["Zalo Accounts"])
all_platform_router.include_router(zalo_conversations_router, prefix="/zalo", tags=["Zalo Conversations"])
all_platform_router.include_router(zalo_events_router, prefix="/zalo", tags=["Zalo Events"])
all_platform_router.include_router(zalo_inbox_share_router, prefix="/zalo", tags=["Zalo Inbox Share"])
all_platform_router.include_router(zalo_proxy_router, prefix="/zalo", tags=["Zalo Proxy"])

