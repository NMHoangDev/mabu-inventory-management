const payload = '{"iss":"supabase","ref":"biivymfjjmcvxtbtsraw","role":"service_role","iat":1780842252,"exp":2096418252}';
console.log("Encoded Base64URL payload:", Buffer.from(payload).toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
);
