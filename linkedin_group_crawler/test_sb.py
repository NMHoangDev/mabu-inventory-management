from dotenv import load_dotenv
load_dotenv()
import sys
sys.path.insert(0, r'd:\CrawlDataLinkedin\linkedin_group_crawler')
from app.core.supabase_client import get_supabase_client
sb = get_supabase_client()
res = sb.table('kpi_tracker').select('*').limit(1).execute()
print(res.data)
