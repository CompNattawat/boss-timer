// src/scheduler/worker.ts
import 'dotenv/config';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';
dayjs.extend(utc); dayjs.extend(tz);

import { Worker } from 'bullmq';
import { redis } from './queues.js';
import { prisma } from '../lib/prisma.js';
import { ENV } from '../lib/env.js';
import cronParser from 'cron-parser';
import { scheduleJobs } from '../services/schedule.service.js';
import { client } from '../lib/client.js';
import { GuildTextBasedChannel } from 'discord.js';

async function start() {
  await client.login(ENV.DISCORD_TOKEN);
  console.log('Worker Discord client logged in');

  // สร้าง Worker เมื่อ client พร้อมแล้ว
  new Worker(
    'alert',
    async job => {
      const { bossId, bossName, nextSpawnISO } = job.data as {
        bossId: string; bossName: string; nextSpawnISO: string;
      };

      const raw = await client.channels.fetch(ENV.DISCORD_SCHEDULE_CHANNEL_ID);
      const chan = raw as GuildTextBasedChannel;
      if (!chan || !chan.isTextBased()) return;

      await chan.send(
        `⏰ อีก 10 นาที **${bossName}** จะเกิด (${dayjs(nextSpawnISO).tz(ENV.TZ).format('DD/MM/YY HH:mm')})`
      );
    },
    { connection: redis }
  );

  new Worker(
    'spawn',
    async job => {
      const { bossId, bossName, nextSpawnISO } = job.data as {
        bossId: string; bossName: string; nextSpawnISO: string;
      };

      const raw = await client.channels.fetch(ENV.DISCORD_SCHEDULE_CHANNEL_ID);
      const chan = raw as GuildTextBasedChannel;
      if (!chan || !chan.isTextBased()) return;

      await chan.send(
        `🎯 **${bossName}** เกิดแล้ว (${dayjs(nextSpawnISO).tz(ENV.TZ).format('DD/MM/YY HH:mm')})`
      );

      await prisma.jobLog.updateMany({
        where: { bossId, runAt: new Date(nextSpawnISO), type: 'spawn' },
        data: { status: 'completed' },
      });

      // ถ้า updateScheduleMessage ต้องการ gameCode ให้ใส่ตามที่ระบบคุณกำหนด
      await import('../services/discord.service.js')
        .then(m => m.updateScheduleMessage());
    },
    { connection: redis }
  );

  async function tickFixed() {
    const rules = await prisma.fixedRule.findMany({
      where: { enabled: true },
      include: { boss: true, game: true },
    });

    for (const r of rules) {
      try {
        const it = cronParser.parseExpression(r.cron, { tz: r.tz || ENV.TZ });
        const next = it.next().toDate();
        if (r.nextPreparedAt && Math.abs(+r.nextPreparedAt - +next) < 30_000) continue;

        await prisma.boss.update({
          where: { id: r.bossId },
          data: { nextSpawnAt: next },
        });
        await scheduleJobs(r.bossId, r.boss.name, next.toISOString());
        await prisma.fixedRule.update({
          where: { id: r.id },
          data: { nextPreparedAt: next },
        });
      } catch (e) {
        console.error('tickFixed error for rule', r.id, e);
      }
    }
  }

  setInterval(tickFixed, 60_000);
  console.log('Worker started (tickFixed every 60s)');
}

start().catch(e => {
  console.error('Worker bootstrap error:', e);
  process.exit(1);
});