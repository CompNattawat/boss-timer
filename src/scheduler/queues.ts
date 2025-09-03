// src/scheduler/queues.ts
import { Queue, JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from '../lib/env.js';

// 1) ถ้ามี REDIS_URL (redis:// หรือ rediss://) ใช้อันนี้ก่อน
//    - ถ้าเป็น rediss:// จะเปิด TLS ให้อัตโนมัติ
// 2) ถ้าอยากบังคับใช้ hostname ภายใน (service name "redis") ให้ตั้ง family: 6
//    (จำเป็นบน Railway internal DNS)
const useUrl = !!ENV.REDIS_URL;

export const redis = useUrl
  ? new Redis(ENV.REDIS_URL!, {
      maxRetriesPerRequest: null,
      // บางผู้ให้บริการใช้ IPv6 หลังแคมป์: ถ้า REDIS_URL อ้าง host ภายใน ให้ family: 6
      family: 6,
      tls: ENV.REDIS_URL!.startsWith('rediss://') ? {} : undefined,
    })
  : new Redis({
      host: process.env.REDISHOST || 'redis', // ชื่อ service ภายในโปรเจกต์เดียวกัน
      port: Number(process.env.REDISPORT || 6379),
      username: process.env.REDISUSER || 'default',
      password: ENV.REDISPASSWORD,
      maxRetriesPerRequest: null,
      family: 6,                // สำคัญสำหรับ DNS ภายใน Railway
      tls: process.env.REDISPORT === '6380' ? {} : undefined, // ถ้าใช้พอร์ต TLS
    });

// ส่ง connection เข้า BullMQ โดยตรง (ตามคู่มือ)
export const alertQueue = new Queue('alert', { connection: redis });
export const spawnQueue = new Queue('spawn', { connection: redis });

export type AlertJobData = { bossId: string; bossName: string; nextSpawnISO: string };
export type SpawnJobData = AlertJobData;

export const defaultJobOpts: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};