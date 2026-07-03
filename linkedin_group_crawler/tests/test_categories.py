"""
Tests cho Category Management API
Cả Facebook lẫn LinkedIn đều dùng CategorySheetService chung.
Không gọi N8N webhook.
"""
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

SHARED_SVC_PATH = "app.shared.services.category_sheet_service.CategorySheetService"


class MockCategorySheetService:
    """Mock CategorySheetService dùng in-memory data."""

    def __init__(self):
        self.data = {
            "intent": [
                {"name": "KOL/Influencer", "desc": "Cá nhân có sức ảnh hưởng lớn", "platform": "Linkedin"},
                {"name": "Community", "desc": "Các hội nhóm, cộng đồng ngành", "platform": "Linkedin"},
            ],
            "industry": [
                {"name": "Information Technology", "code": "active"},
                {"name": "Marketing & Advertising", "code": "active"},
            ],
            "tier": [
                {"name": "Tier 1", "budget": "High"},
                {"name": "Tier 2", "budget": "Medium"},
            ],
            "team": [{"team_name": "Growth Team", "leader": "Minh Hoang"}],
            "icp": [{"target": "Founder / CEO", "geo": "US/UK"}],
        }

    def get_all_categories(self):
        return self.data

    def add_record(self, tab, value, name, platform=""):
        if tab not in self.data:
            self.data[tab] = []
        key = "team_name" if tab == "team" else "target" if tab == "icp" else "name"
        if any(item[key] == value for item in self.data[tab]):
            return False
        if tab == "intent":
            self.data[tab].append({"name": value, "desc": name, "platform": platform})
        elif tab == "industry":
            self.data[tab].append({"name": value, "code": name})
        elif tab == "tier":
            self.data[tab].append({"name": value, "budget": name})
        elif tab == "team":
            self.data[tab].append({"team_name": value, "leader": name})
        elif tab == "icp":
            self.data[tab].append({"target": value, "geo": name})
        return True

    def update_record(self, tab, value, name, platform=""):
        if tab not in self.data:
            return False
        key = "team_name" if tab == "team" else "target" if tab == "icp" else "name"
        for item in self.data[tab]:
            if item[key] == value:
                if tab == "intent":
                    item["desc"] = name
                    if platform:
                        item["platform"] = platform
                elif tab == "industry":
                    item["code"] = name
                elif tab == "tier":
                    item["budget"] = name
                elif tab == "team":
                    item["leader"] = name
                elif tab == "icp":
                    item["geo"] = name
                return True
        return False

    def delete_record(self, tab, value):
        if tab not in self.data:
            return False
        key = "team_name" if tab == "team" else "target" if tab == "icp" else "name"
        orig = len(self.data[tab])
        self.data[tab] = [r for r in self.data[tab] if r[key] != value]
        return len(self.data[tab]) < orig


# ── Facebook category endpoints ────────────────────────────────────────────────

@patch("app.modules.facebook.src.modules.crawl_fb.router.sheet_management.CategorySheetService")
def test_facebook_categories_crud(mock_cls):
    mock_cls.return_value = MockCategorySheetService()

    # GET
    r = client.get("/facebook/api/v1/categories")
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert "intent" in r.json()["data"]
    assert "industry" in r.json()["data"]

    # ADD industry
    r = client.post("/facebook/api/v1/categories/add", json={
        "category_type": "industry",
        "value": "artificial_intelligence",
        "name": "AI & Deep Learning",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "success"

    # ADD intent with platform
    r = client.post("/facebook/api/v1/categories/add", json={
        "category_type": "intent",
        "value": "AI_Tech",
        "name": "AI Technology",
        "platform": "Facebook",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "success"

    # UPDATE industry
    r = client.put("/facebook/api/v1/categories/update", json={
        "category_type": "industry",
        "value": "artificial_intelligence",
        "name": "Artificial Intelligence",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "success"

    # DELETE industry
    r = client.request("DELETE", "/facebook/api/v1/categories/delete", json={
        "category_type": "industry",
        "value": "artificial_intelligence",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "success"


# ── LinkedIn category endpoints ────────────────────────────────────────────────

@patch("app.modules.linkedin.router._CategorySheetService")
def test_linkedin_categories_crud(mock_cls):
    mock_cls.return_value = MockCategorySheetService()

    headers = {"X-API-Key": settings.api_key} if settings.api_key else {}

    # GET
    r = client.get("/api/linkedin/categories", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert "intent" in r.json()["data"]

    # ADD industry
    r = client.post("/api/linkedin/categories/add", json={
        "category_type": "industry",
        "value": "it_software",
        "name": "IT & Software",
    }, headers=headers)
    assert r.status_code == 200
    assert r.json()["success"] is True

    # ADD intent with platform
    r = client.post("/api/linkedin/categories/add", json={
        "category_type": "intent",
        "value": "KOL",
        "name": "Influencer",
        "platform": "Linkedin",
    }, headers=headers)
    assert r.status_code == 200
    assert r.json()["success"] is True

    # UPDATE industry
    r = client.post("/api/linkedin/categories/update", json={
        "category_type": "industry",
        "value": "it_software",
        "name": "Software Engineering",
    }, headers=headers)
    assert r.status_code == 200
    assert r.json()["success"] is True

    # DELETE industry
    r = client.post("/api/linkedin/categories/delete", json={
        "category_type": "industry",
        "value": "it_software",
    }, headers=headers)
    assert r.status_code == 200
    assert r.json()["success"] is True
