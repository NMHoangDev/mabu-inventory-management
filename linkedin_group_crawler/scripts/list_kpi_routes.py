"""List all KPI routes."""
from app.main import app
all_routes = [(getattr(r, "path", ""), list(getattr(r, "methods", []) or [])) for r in app.routes]
kpi_routes = [r for r in all_routes if "kpi" in r[0].lower()]
for path, methods in sorted(kpi_routes):
    print(" ".join(methods).ljust(12), path)
