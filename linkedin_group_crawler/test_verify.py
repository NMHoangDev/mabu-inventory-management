from dotenv import load_dotenv
load_dotenv()
from app.modules.all_platform.services.supabase_seeding_service import verify_seeding_mark

payload = {
    "email_member": "ngminhhoang0934@gmail.com",
    "link_post": "https://www.facebook.com/groups/327940020092140/posts/966621162890686/",
    "platform": "Facebook",
    "content": "test content",
    "link_comment": "https://facebook.com/comment",
    "id_social_account": "test-uuid"
}

try:
    res = verify_seeding_mark(payload)
    print("Success:", res)
except Exception as e:
    print("Error:", repr(e))
