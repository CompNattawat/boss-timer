import dayjs from 'dayjs';
import { alertQueue, spawnQueue, defaultJobOpts } from '../scheduler/queues.js';
import { prisma } from '../lib/prisma.js';

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