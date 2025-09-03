// src/scheduler/queues.ts
import { Queue, JobsOptions } from 'bullmq';
import pkg from 'ioredis';
import { ENV } from '../lib/env.js';

// รองรับทั้ง ESM/CJS ของ ioredis
const IORedis = (pkg as any).default ?? pkg;
const url = ENV.REDIS_URL;
console.log('REDIS_URL =', url);

// ✅ export ออกไปใช้ที่อื่นได้
export const connection = new IORedis(url, {
  maxRetriesPerRequest: null,
  tls: url.startsWith("rediss://") ? {} : undefined,
});

export const alertQueue = new Queue('alert', { connection });
export const spawnQueue = new Queue('spawn', { connection });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};