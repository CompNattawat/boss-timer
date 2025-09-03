// src/scheduler/queues.ts
import { Queue, JobsOptions } from 'bullmq';
import pkg from 'ioredis';
import { ENV } from '../lib/env.js';

// รองรับทั้ง ESM/CJS ของ ioredis
const IORedis = (pkg as any).default ?? pkg;

// ✅ export ออกไปใช้ที่อื่นได้
export const connection = new IORedis(ENV.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const alertQueue = new Queue('alert', { connection });
export const spawnQueue = new Queue('spawn', { connection });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};