// src/scheduler/queues.ts
import { Queue, JobsOptions } from 'bullmq';
import dns from 'node:dns';
import pkg from 'ioredis';
import { ENV } from '../lib/env.js';
const IORedis = (pkg as any).default ?? pkg;

// รองรับทั้ง ESM/CJS ของ ioredis
const dnsLookupV6: any = (hostname: string, _opts: any, cb: any) => {
  dns.lookup(hostname, { family: 6 }, cb);
};

export const connection = new IORedis(ENV.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: ENV.REDIS_URL.startsWith('rediss://') ? {} : undefined,
  dnsLookup: dnsLookupV6,   // 👈 เพิ่มบรรทัดนี้
});

export const alertQueue = new Queue('alert', { connection });
export const spawnQueue = new Queue('spawn', { connection });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};