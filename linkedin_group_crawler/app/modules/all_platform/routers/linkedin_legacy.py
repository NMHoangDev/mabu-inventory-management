"""Legacy LinkedIn endpoints wrapped for all-platform."""

from fastapi import APIRouter
from app.modules.linkedin.router import router as old_router, linkedin_app_router as old_app_router

router = APIRouter()

# Dynamically re-mount all routes from the old router by copying them
for route in old_router.routes:
    # route.path has "/api/linkedin/..." 
    # we want to strip "/api/linkedin"
    path = route.path.replace("/api/linkedin", "")
    if not path.startswith("/"):
        path = "/" + path
    
    router.add_api_route(
        path=path,
        endpoint=route.endpoint,
        methods=route.methods,
        name=route.name,
        dependencies=route.dependencies,
        response_model=route.response_model,
        tags=["All-Platform Legacy LinkedIn"],
    )

for route in old_app_router.routes:
    # route.path has "/api/linkedin/app/..." 
    path = route.path.replace("/api/linkedin", "")
    if not path.startswith("/"):
        path = "/" + path
    
    router.add_api_route(
        path=path,
        endpoint=route.endpoint,
        methods=route.methods,
        name=route.name,
        dependencies=route.dependencies,
        response_model=route.response_model,
        tags=["All-Platform Legacy LinkedIn App"],
    )
