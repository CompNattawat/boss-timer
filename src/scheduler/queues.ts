// src/scheduler/queues.ts
import { Queue, JobsOptions } from 'bullmq';
import pkg from 'ioredis';
const IORedis = (pkg as any).default ?? pkg;

const host = process.env.REDIS_HOST_OVERRIDE || process.env.REDISHOST || 'redis';
const port = process.env.REDISPORT || '6379';
const user = process.env.REDISUSER || 'default';
const pass = process.env.REDISPASSWORD || '';

const redisUrl =
  process.env.REDIS_URL /* เผื่อไว้ ถ้ามีค่าเป็น public/proxy */
  || `redis://${user}:${pass}@${host}:${port}`;

console.log('Redis target:', redisUrl.replace(/\/\/.*@/, '//****@'));

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
});

export const alertQueue = new Queue('alert', { connection });
export const spawnQueue = new Queue('spawn', { connection });

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};