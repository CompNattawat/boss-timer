// schedule.service.ts
import dayjs from 'dayjs';
import { Queue, JobsOptions, Job } from 'bullmq';
import { redis } from '../scheduler/queues.js';

export const alertQueue = new Queue('alert', { connection: redis });
export const spawnQueue = new Queue('spawn', { connection: redis });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

// ลบงานเดิมของบอสออกทั้งหมด (กันยิงซ้ำ)
async function removeOldJobsForBoss(bossId: string) {
  const states = ['delayed','waiting','active','paused'];
  const alertJobs = await alertQueue.getJobs(states as any);
  const spawnJobs = await spawnQueue.getJobs(states as any);

  for (const j of alertJobs) if (j.name === 'alert' && String(j.data?.bossId) === bossId) await j.remove();
  for (const j of spawnJobs) if (j.name === 'spawn' && String(j.data?.bossId) === bossId) await j.remove();
}

/** เรียกจาก /boss death (หรือจุดที่อัปเดต nextSpawnAt)
 *  จะยกเลิกงานเก่า แล้วลงงานใหม่ให้เสมอ
 */
export async function scheduleJobs(bossId: string, bossName: string, nextSpawnISO: string) {
  const next = dayjs(nextSpawnISO);
  if (!next.isValid()) {
    console.warn('[schedule] skip: invalid nextSpawnISO', bossId, nextSpawnISO);
    return;
  }

  // กันกรณีเลยเวลาแล้ว
  const delaySpawn = Math.max(0, next.diff(dayjs()));
  if (delaySpawn === 0) {
    console.log('[schedule] next already past or now, skip scheduling', bossId);
    await removeOldJobsForBoss(bossId); // เคลียร์งานเก่าไว้ก่อน
    return;
  }
  const delayAlert = Math.max(0, next.subtract(10, 'minute').diff(dayjs()));

  // 1) เคลียร์งานเก่า
  await removeOldJobsForBoss(bossId);

  // 2) ลงงานใหม่ด้วย jobId คงที่ต่อบอส
  await alertQueue.add(
    'alert',
    { bossId, bossName, nextSpawnISO } as AlertJobData,
    { jobId: `a:${bossId}`, delay: delayAlert, ...defaultJobOpts }
  );
  
  await spawnQueue.add(
    'spawn',
    { bossId, bossName, nextSpawnISO } as SpawnJobData,
    { jobId: `s:${bossId}`, delay: delaySpawn, ...defaultJobOpts }
  );

  console.log('[schedule] scheduled', bossId, { delayAlert, delaySpawn });
}