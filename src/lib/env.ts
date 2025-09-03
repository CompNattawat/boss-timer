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

  // Database
  DATABASE_URL: required('DATABASE_URL'),

  // Redis (ใช้ URL เดียวที่ Railway generate ให้)
  REDIS_URL: required('REDIS_URL'),

  // Discord
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DISCORD_APP_ID: required('DISCORD_APP_ID'),
  DISCORD_GUILD_ID: required('DISCORD_GUILD_ID'),
  DISCORD_SCHEDULE_CHANNEL_ID: required('DISCORD_SCHEDULE_CHANNEL_ID'),
  DISCORD_SCHEDULE_MESSAGE_ID: required('DISCORD_SCHEDULE_MESSAGE_ID'),

  // Misc
  DEFAULT_GAME_CODE: process.env.DEFAULT_GAME_CODE ?? 'L9',
};