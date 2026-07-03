"""Service for Admin Dashboard statistics and analytics."""

from __future__ import annotations

from datetime import date, timedelta, timezone
from typing import Dict, List, Any
import time
from app.core.supabase_client import execute_supabase_query, get_supabase_client

VN_TZ = timezone(timedelta(hours=7))

_CACHE_TTL_SECONDS = 30.0
_CACHE: dict[str, tuple[float, Any]] = {}


def _get_cached(key: str) -> Any | None:
    item = _CACHE.get(key)
    if not item:
        return None
    expires_at, value = item
    if expires_at > time.monotonic():
        return value
    _CACHE.pop(key, None)
    return None


def _set_cached(key: str, value: Any) -> Any:
    _CACHE[key] = (time.monotonic() + _CACHE_TTL_SECONDS, value)
    return value


def get_top_stats() -> Dict[str, Any]:
    """Calculate top dashboard stats: crawled posts, seeding count, approval rate, KPI rate."""
    cached = _get_cached("top_stats")
    if cached is not None:
        return cached

    # 1. Total crawled posts (FB + LI)
    try:
        fb_res = execute_supabase_query(
            lambda: get_supabase_client().table("facebook_posts").select("id", count="exact").limit(1).execute()
        )
        fb_count = fb_res.count if fb_res.count is not None else len(fb_res.data or [])
    except Exception:
        fb_count = 0

    try:
        li_res = execute_supabase_query(
            lambda: get_supabase_client().table("linkedin_posts").select("id", count="exact").limit(1).execute()
        )
        li_count = li_res.count if li_res.count is not None else len(li_res.data or [])
    except Exception:
        li_count = 0

    total_crawled_posts = fb_count + li_count

    # 2. Total Seeding Comments
    try:
        seeding_res = execute_supabase_query(
            lambda: get_supabase_client().table("seeding_content_kpi").select("id", count="exact").limit(1).execute()
        )
        total_seeding = seeding_res.count if seeding_res.count is not None else len(seeding_res.data or [])
    except Exception:
        total_seeding = 0

    # 3. Approval Rate
    try:
        approved_res = execute_supabase_query(
            lambda: get_supabase_client()
            .table("seeding_content_kpi")
            .select("id", count="exact")
            .eq("verify", "yes")
            .limit(1)
            .execute()
        )
        approved_count = approved_res.count if approved_res.count is not None else len(approved_res.data or [])
    except Exception:
        approved_count = 0

    approval_rate = round((approved_count / total_seeding * 100), 1) if total_seeding > 0 else 0.0

    # 4. Average KPI completion rate across active KPIs (current VN week)
    try:
        kpis = execute_supabase_query(
            lambda: get_supabase_client().table("kpi_tracker").select("*").eq("status", "active").execute()
        ).data or []
        if not kpis:
            kpi_rate = 0.0
        else:
            # Compute current VN week boundaries
            today_vn = date.today()  # server runs in VN timezone
            monday_vn = today_vn - timedelta(days=today_vn.weekday())
            sunday_vn = monday_vn + timedelta(days=6)

            # Load seeding contents for current VN week only (server-side filter)
            seeding_data = execute_supabase_query(
                lambda: (
                    get_supabase_client()
                    .table("seeding_content_kpi")
                    .select("id_member, current_day")
                    .gte("current_day", monday_vn.isoformat())
                    .lte("current_day", sunday_vn.isoformat())
                    .execute()
                )
            ).data or []

            total_target = 0
            total_actual = 0

            for k in kpis:
                mid = str(k.get("id_member"))
                sd = k.get("start_date")
                ed = k.get("end_date")

                # Targets
                comment_t = k.get("kpi_comment") or 0
                post_t = k.get("kpi_post") or 0
                lead_t = k.get("kpi_lead") or 0
                inbox_t = k.get("kpi_inbox") or 0

                total_target += comment_t + post_t + lead_t + inbox_t

                # Actual comments within KPI range (intersection with current week)
                actual_comments = 0
                if sd and ed:
                    # Overlap between KPI range [sd, ed] and current week [monday, sunday]
                    overlap_start = max(sd, monday_vn.isoformat())
                    overlap_end = min(ed, sunday_vn.isoformat())
                    if overlap_start <= overlap_end:
                        actual_comments = sum(
                            1 for s in seeding_data
                            if str(s.get("id_member")) == mid
                            and s.get("current_day")
                            and overlap_start <= s["current_day"] <= overlap_end
                        )
                total_actual += actual_comments

            kpi_rate = round((total_actual / total_target * 100), 1) if total_target > 0 else 0.0
    except Exception:
        kpi_rate = 0.0

    return _set_cached("top_stats", {
        "total_crawled_posts": total_crawled_posts,
        "total_seeding_comments": total_seeding,
        "approval_rate": approval_rate,
        "kpi_rate": kpi_rate,
    })


def get_kpi_performance() -> List[Dict[str, Any]]:
    """Get KPI performance target vs actual progress for all teams."""
    cached = _get_cached("kpi_performance")
    if cached is not None:
        return cached
    try:
        # Load teams
        teams = execute_supabase_query(
            lambda: get_supabase_client().table("teams").select("id, name_team").execute()
        ).data or []
        if not teams:
            return []

        # Load member_of_teams associations
        mot_rows = execute_supabase_query(
            lambda: get_supabase_client().table("member_of_teams").select("id_teams, id_member").execute()
        ).data or []
        team_members = {}
        for mot in mot_rows:
            tid = str(mot["id_teams"])
            mid = str(mot["id_member"])
            if tid not in team_members:
                team_members[tid] = []
            team_members[tid].append(mid)

        # Load active KPIs
        kpis = execute_supabase_query(
            lambda: get_supabase_client().table("kpi_tracker").select("*").eq("status", "active").execute()
        ).data or []

        # Compute current VN week boundaries
        today_vn = date.today()
        monday_vn = today_vn - timedelta(days=today_vn.weekday())
        sunday_vn = monday_vn + timedelta(days=6)

        # Load seeding records for current VN week only (server-side filter)
        seeding_data = execute_supabase_query(
            lambda: (
                get_supabase_client()
                .table("seeding_content_kpi")
                .select("id_member, current_day")
                .gte("current_day", monday_vn.isoformat())
                .lte("current_day", sunday_vn.isoformat())
                .execute()
            )
        ).data or []

        # Group data by team name
        team_performance = {}
        for t in teams:
            tid = str(t["id"])
            tname = t.get("name_team") or "Unnamed Team"
            if tname not in team_performance:
                team_performance[tname] = {"target": 0, "actual": 0}

            mids = team_members.get(tid, [])
            for mid in mids:
                # Find active KPI for this member and this team
                k = next((item for item in kpis if str(item.get("id_member")) == mid and str(item.get("id_team")) == tid), None)
                if k:
                    comment_t = k.get("kpi_comment") or 0
                    post_t = k.get("kpi_post") or 0
                    lead_t = k.get("kpi_lead") or 0
                    inbox_t = k.get("kpi_inbox") or 0
                    team_performance[tname]["target"] += comment_t + post_t + lead_t + inbox_t

                    sd = k.get("start_date")
                    ed = k.get("end_date")
                    if sd and ed:
                        # Overlap between KPI range [sd, ed] and current week [monday, sunday]
                        overlap_start = max(sd, monday_vn.isoformat())
                        overlap_end = min(ed, sunday_vn.isoformat())
                        if overlap_start <= overlap_end:
                            actual = sum(
                                1 for s in seeding_data
                                if str(s.get("id_member")) == mid
                                and s.get("current_day")
                                and overlap_start <= s["current_day"] <= overlap_end
                            )
                            team_performance[tname]["actual"] += actual

        return _set_cached("kpi_performance", [
            {"team_name": name, "target": stats["target"], "actual": stats["actual"]}
            for name, stats in team_performance.items()
        ])
    except Exception:
        return []


def get_leaderboards() -> Dict[str, List[Dict[str, Any]]]:
    """Get top 5 seeders and top 5 groups with highest interaction."""
    cached = _get_cached("leaderboards")
    if cached is not None:
        return cached
    
    # 1. Top Seeders (current VN week)
    top_seeders = []
    try:
        today_vn = date.today()
        monday_vn = today_vn - timedelta(days=today_vn.weekday())
        sunday_vn = monday_vn + timedelta(days=6)
        seeding_res = execute_supabase_query(
            lambda: (
                get_supabase_client().table("seeding_content_kpi")
                .select("id_member")
                .eq("verify", "yes")
                .gte("current_day", monday_vn.isoformat())
                .lte("current_day", sunday_vn.isoformat())
                .execute()
            )
        )
        seeding_list = seeding_res.data or []

        # Group and count
        counts = {}
        for s in seeding_list:
            mid = str(s.get("id_member"))
            counts[mid] = counts.get(mid, 0) + 1

        sorted_mids = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:5]
        if sorted_mids:
            uids = [m[0] for m in sorted_mids]
            users_res = execute_supabase_query(
                lambda: get_supabase_client().table("app_users").select("id, email, name").in_("id", uids).execute()
            )
            user_map = {str(u["id"]): u for u in (users_res.data or [])}
            
            for mid, count in sorted_mids:
                uinfo = user_map.get(mid) or {}
                top_seeders.append({
                    "name": uinfo.get("name") or uinfo.get("email") or "Unknown",
                    "email": uinfo.get("email") or "—",
                    "count": count
                })
    except Exception:
        pass

    # 2. Top Groups by crawl/interaction count in facebook_posts
    top_groups = []
    try:
        fb_posts = execute_supabase_query(
            lambda: get_supabase_client().table("facebook_posts").select("group_id, reactions, comments").execute()
        ).data or []
        
        group_interactions = {}
        for p in fb_posts:
            gid = p.get("group_id")
            if not gid:
                continue
            reactions = p.get("reactions") or 0
            comments = p.get("comments") or 0
            group_interactions[gid] = group_interactions.get(gid, 0) + (reactions + comments)
            
        sorted_gids = sorted(group_interactions.items(), key=lambda x: x[1], reverse=True)[:5]
        
        if sorted_gids:
            gids = [item[0] for item in sorted_gids]
            groups_res = execute_supabase_query(
                lambda: get_supabase_client().table("facebook_groups").select("id, group_name, group_url").in_("id", gids).execute()
            ).data or []
            groups_map = {g["id"]: g for g in groups_res}
            
            for gid, count in sorted_gids:
                ginfo = groups_map.get(gid)
                if ginfo:
                    gurl = ginfo.get("group_url") or "#"
                    top_groups.append({
                        "name": ginfo.get("group_name") or "Unknown Group",
                        "url": gurl,
                        "interactions": count
                    })
    except Exception:
        pass

    return _set_cached("leaderboards", {
        "top_seeders": top_seeders,
        "top_groups": top_groups
    })
