// src/scheduler/queues.ts
import { Queue, JobsOptions, QueueOptions } from 'bullmq';
import pkg from 'ioredis';
import { ENV } from '../lib/env.js';

const IORedis = (pkg as any).default ?? pkg;

export const redis = new IORedis(ENV.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: ENV.REDIS_URL.startsWith('rediss://') ? {} : undefined,
});

export const alertQueue = new Queue('alert', { connection: redis });
export const spawnQueue = new Queue('spawn', { connection: redis });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};