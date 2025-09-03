// src/scheduler/queues.ts
import { Queue, JobsOptions, QueueOptions } from 'bullmq';
import pkg from 'ioredis';
import { ENV } from '../lib/env.js';

// รองรับทั้ง ESM/CJS
const IORedis = (pkg as any).default ?? (pkg as any);

export const connection =
  ENV.REDIS_URL
    ? new IORedis(ENV.REDIS_URL, {
        maxRetriesPerRequest: null,
        tls: ENV.REDIS_URL.startsWith('rediss://') ? {} : undefined,
      })
    : new IORedis({
        host: ENV.REDISHOST,
        port: Number(ENV.REDISPORT),
        username: ENV.REDISUSER || undefined,
        password: ENV.REDISPASSWORD || undefined,
        maxRetriesPerRequest: null,
        tls: ENV.REDISPORT === '6380' ? {} : undefined,
      });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const queueOpts: QueueOptions = {
  connection,
  defaultJobOptions: defaultJobOpts,
};

export const alertQueue = new Queue<AlertJobData>('alert', queueOpts);
export const spawnQueue = new Queue<SpawnJobData>('spawn', queueOpts);