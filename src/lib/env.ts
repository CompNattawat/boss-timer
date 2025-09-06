// src/lib/env.ts
import 'dotenv/config';

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ENV ${name}`);
  return v;
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  TZ: process.env.TZ ?? 'Asia/Bangkok',
  DATABASE_URL: required('DATABASE_URL'),

  SERVICE_ROLE: required('SERVICE_ROLE'),
  COMMAND_SCOPE: required('COMMAND_SCOPE') ?? 'global',
  // เลือกได้ 2 ทาง: ใช้ URL เดียว หรือใช้ชุด HOST/PORT/USER/PASS
  REDIS_URL: process.env.REDIS_URL,         // เช่น rediss://default:pass@host:6380
  REDISPASSWORD: process.env.REDISPASSWORD, // เผื่อกรณีสร้างจาก HOST/PORT

  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DISCORD_APP_ID: required('DISCORD_APP_ID'),
  DISCORD_GUILD_ID: required('DISCORD_GUILD_ID'),
  DISCORD_SCHEDULE_CHANNEL_ID: required('DISCORD_SCHEDULE_CHANNEL_ID'),
  DISCORD_SCHEDULE_MESSAGE_ID: required('DISCORD_SCHEDULE_MESSAGE_ID'),
  DEFAULT_GAME_CODE: process.env.DEFAULT_GAME_CODE ?? 'L9',
};