import dayjs from 'dayjs';
import { Queue, JobsOptions } from 'bullmq';;
import { redis } from '../scheduler/queues.js'
import { prisma } from '../lib/prisma.js';

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
export async function scheduleJobs(bossId: string, bossName: string, nextSpawnISO: string) {
  const next = dayjs(nextSpawnISO);
  const alertAt = next.subtract(10, 'minute');

  await alertQueue.add(
    'alert',
    { bossId, bossName, nextSpawnISO },
    { delay: Math.max(0, alertAt.diff(dayjs())), ...defaultJobOpts }
  );

  await spawnQueue.add(
    'spawn',
    { bossId, bossName, nextSpawnISO },
    { delay: Math.max(0, next.diff(dayjs())), ...defaultJobOpts }
  );

  await prisma.jobLog.createMany({
    data: [
      { bossId, type: 'alert', runAt: alertAt.toDate(), status: 'scheduled' },
      { bossId, type: 'spawn', runAt: next.toDate(), status: 'scheduled' },
    ],
  });
}