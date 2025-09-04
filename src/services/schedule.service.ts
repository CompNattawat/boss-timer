import dayjs from 'dayjs';
import { Queue, JobsOptions } from 'bullmq';;
import { redis } from '../scheduler/queues.js'

// --- BullMQ Queues ---
export const alertQueue = new Queue('alert', { connection: redis });
export const spawnQueue = new Queue('spawn', { connection: redis });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

// เรียกจาก /boss death เพื่อวางงานแจ้งเตือน
// schedule.service.ts
export async function scheduleJobs(bossId: string, bossName: string, nextSpawnISO: string) {
  const delayAlert = Math.max(0, dayjs(nextSpawnISO).subtract(10,'minute').diff(dayjs()));
  const delaySpawn = Math.max(0, dayjs(nextSpawnISO).diff(dayjs()));

  await alertQueue.add(
    'alert',
    { bossId, bossName, nextSpawnISO },
    {
      jobId: `a:${bossId}:${nextSpawnISO}`,
      delay: delayAlert,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );

  await spawnQueue.add(
    'spawn',
    { bossId, bossName, nextSpawnISO },
    {
      jobId: `s:${bossId}:${nextSpawnISO}`,
      delay: delaySpawn,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );
}