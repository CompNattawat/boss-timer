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

  // Redis: เลือกอย่างใดอย่างหนึ่ง
  REDIS_URL: process.env.REDIS_URL,          // rediss://user:pass@host:port
  REDISHOST: process.env.REDISHOST,
  REDISPORT: process.env.REDISPORT,
  REDISUSER: process.env.REDISUSER,
  REDISPASSWORD: process.env.REDISPASSWORD,

  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DISCORD_APP_ID: required('DISCORD_APP_ID'),
  DISCORD_GUILD_ID: required('DISCORD_GUILD_ID'),
  DISCORD_SCHEDULE_CHANNEL_ID: required('DISCORD_SCHEDULE_CHANNEL_ID'),
  DISCORD_SCHEDULE_MESSAGE_ID: required('DISCORD_SCHEDULE_MESSAGE_ID'),
  DEFAULT_GAME_CODE: process.env.DEFAULT_GAME_CODE ?? 'L9',
};

// ต้องมีอย่างน้อย REDIS_URL หรือ REDISHOST
if (!ENV.REDIS_URL && !ENV.REDISHOST) {
  throw new Error('Provide either REDIS_URL or REDISHOST/REDISPORT (Railway envs).');
}