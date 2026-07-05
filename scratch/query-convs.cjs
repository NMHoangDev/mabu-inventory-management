const fs = require('fs');
const path = require('path');

// Load env manually (avoid dotenv install)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing env');
    process.exit(1);
  }
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: convs } = await sb
    .from('zalo_conversations_ui')
    .select('conversation_id,conversation_name,thread_type,latest_is_self,latest_sender_id,latest_content')
    .or('conversation_name.ilike.%Team 6%,conversation_name.ilike.%3vs fb%,conversation_name.ilike.%3 vs fb%,conversation_name.ilike.%3VS FB%')
    .order('latest_message_at', { ascending: false });
  console.log('=== CONVS ===');
  console.log(JSON.stringify(convs, null, 2));

  for (const c of convs || []) {
    console.log(`\n=== MESSAGES in "${c.conversation_name}" (${c.conversation_id}) ===`);
    const { data: msgs } = await sb
      .from('zalo_messages')
      .select('source_message_id,sender_id,sender_name,is_sent,content,ts')
      .eq('thread_id', c.conversation_id)
      .order('ts', { ascending: false })
      .limit(20);
    console.log(JSON.stringify(msgs, null, 2));
  }
})();
