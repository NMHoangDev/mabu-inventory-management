import os
from dotenv import load_dotenv
load_dotenv()
from app.core.supabase_client import get_supabase_client
from datetime import datetime

supabase = get_supabase_client()
res = supabase.table('facebook_groups').select('*').eq('chay_24h', True).execute()
all_auto_groups = res.data or []

now = datetime.now()
now_hour = 22
now_minute = 40
now_minutes = now_hour * 60 + now_minute

print(f'Total chay_24h groups: {len(all_auto_groups)}')

for row in all_auto_groups:
    print('\n---')
    print(f"Group: {row.get('group_name')}")
    start_time = row.get('start_time_in_day')
    end_time = row.get('end_time_in_day')
    time_crawl = row.get('time_crawl')
    end_date_str = row.get('end_date_hour')
    
    print(f'start_time: {start_time}, end_time: {end_time}, time_crawl: {time_crawl}, end_date_str: {end_date_str}')
    
    if start_time is None or end_time is None or time_crawl is None or int(time_crawl) <= 0:
        print('Skipped due to None values')
        continue
    
    start_time = int(start_time)
    end_time = int(end_time)
    time_crawl = int(time_crawl)
    
    if end_date_str:
        try:
            end_date = datetime.strptime(end_date_str[:10], '%Y-%m-%d').date()
            if now.date() > end_date:
                print('Skipped due to end_date')
                continue
        except ValueError as e:
            pass
            
    start_minutes = start_time * 60
    end_minutes = end_time * 60
    
    print(f'start_minutes: {start_minutes}, now_minutes: {now_minutes}, end_minutes: {end_minutes}')
    if start_minutes <= now_minutes <= end_minutes:
        diff = now_minutes - start_minutes
        print(f'diff: {diff}, time_crawl: {time_crawl}, diff % time_crawl: {diff % time_crawl}')
        if diff % time_crawl == 0:
            group_url = row.get('group_url')
            print(f'Will trigger! URL: {group_url}')
        else:
            print('Did not trigger because interval mismatch')
    else:
        print('Did not trigger because out of time window')
