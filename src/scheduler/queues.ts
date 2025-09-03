import { Queue, Worker, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../lib/env';

export const connection = new IORedis(ENV.REDIS_URL, { maxRetriesPerRequest: null });

export const alertQueue = new Queue('alert', { connection });
export const spawnQueue = new Queue('spawn', { connection });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};