// src/lib/env.ts
function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ENV ${name}`);
  return v;
}
function optional(name: string, fallback?: string) {
  const v = process.env[name];
  return v ?? fallback;
}

export const ENV = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DISCORD_APP_ID: required('DISCORD_APP_ID'),

  // 👇 ตั้งค่า default เป็น 'global' ถ้าไม่ได้ระบุ
  COMMAND_SCOPE: optional('COMMAND_SCOPE', 'global'),

  // ค่าอื่น ๆ ที่อาจจะยังใช้ในบางที่
  DEFAULT_GAME_CODE: optional('DEFAULT_GAME_CODE', 'L9'),
  TZ: optional('TZ', 'Asia/Bangkok'),

  DATABASE_URL: required('DATABASE_URL'),
  SERVICE_ROLE: required('SERVICE_ROLE'),
  // เลือกได้ 2 ทาง: ใช้ URL เดียว หรือใช้ชุด HOST/PORT/USER/PASS
  REDIS_URL: process.env.REDIS_URL,         // เช่น rediss://default:pass@host:6380
  REDISPASSWORD: process.env.REDISPASSWORD, // เผื่อกรณีสร้างจาก HOST/PORT

  DISCORD_GUILD_ID: required('DISCORD_GUILD_ID'),
  DISCORD_SCHEDULE_CHANNEL_ID: required('DISCORD_SCHEDULE_CHANNEL_ID'),
  DISCORD_SCHEDULE_MESSAGE_ID: required('DISCORD_SCHEDULE_MESSAGE_ID'),
};