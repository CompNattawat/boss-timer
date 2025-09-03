// src/scheduler/queues.ts
import { Queue, JobsOptions } from 'bullmq';
import pkg from 'ioredis';
import { ENV } from '../lib/env.js';

const IORedis = (pkg as any).default ?? pkg;

export const redis = new IORedis({
  host: 'redis',           // <— ชื่อ service
  port: 6379,
  username: 'default',
  password: ENV.REDISPASSWORD!, // อ้างจาก Redis service reference ก็ได้
  maxRetriesPerRequest: null,
});

export const alertQueue = new Queue('alert', { connection: redis });
export const spawnQueue = new Queue('spawn', { connection: redis });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};