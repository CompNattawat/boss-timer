// src/scheduler/index.ts
import 'dotenv/config';
import { scheduleJobs } from '../services/schedule.service.js'; // <- ไฟล์ที่คุณเขียนไว้
import { prisma } from '../lib/prisma.js';

async function bootstrap() {
  console.log('🚀 Scheduler service started');

  // ตัวอย่าง: ดึง boss list จาก database แล้วตั้ง schedule
  const bosses = await prisma.boss.findMany();

  for (const boss of bosses) {
    if (boss.nextSpawnISO) {
      await scheduleJobs(boss.id, boss.name, boss.nextSpawnISO);
      console.log(`Scheduled jobs for boss: ${boss.name}`);
    }
  }
}

bootstrap().catch(err => {
  console.error('Scheduler failed:', err);
  process.exit(1);
});