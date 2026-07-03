import re

file_path = r'd:\CrawlDataLinkedin\linkedin_group_crawler\app\modules\all_platform\services\unified_posts_service.py'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the select
old_select = '    query = tbl.select("*", count="exact")'
new_select = '''    # Select nested group to get group_name
    if table == "facebook_posts":
        query = tbl.select("*, facebook_groups(group_name)", count="exact")
    else:
        query = tbl.select("*, linkedin_groups(group_name)", count="exact")'''

content = content.replace(old_select, new_select)

# Replace the return
old_return = '''    result = query.execute()
    posts = result.data or []
    total = result.count or len(posts)

    return posts, total'''

new_return = '''    result = query.execute()
    posts = result.data or []
    total = result.count or len(posts)

    # Map nested group properties to root
    for p in posts:
        grp = p.pop("facebook_groups", None) or p.pop("linkedin_groups", None)
        if grp and isinstance(grp, dict):
            p["group_name"] = grp.get("group_name")

    return posts, total'''

content = content.replace(old_return, new_return)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched unified_posts_service.py")
