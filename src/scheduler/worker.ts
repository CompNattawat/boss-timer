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
import type { GuildTextBasedChannel } from 'discord.js';

const TZ = ENV.TZ || 'Asia/Bangkok';

/** ส่งข้อความไปทุกกิลด์ที่ผูกกับ gameId และตั้งค่า scheduleChannelId ไว้แล้ว */
async function broadcastToGameGuilds(gameId: string, text: string) {
  // platform='discord' และมี scheduleChannelId
  const guilds = await prisma.guild.findMany({
    where: {
      platform: 'discord',
      gameId,
      scheduleChannelId: { not: null },
    },
    select: { scheduleChannelId: true },
  });

  for (const g of guilds) {
    if (!g.scheduleChannelId) continue;
    try {
      const raw = await client.channels.fetch(g.scheduleChannelId);
      const chan = raw as GuildTextBasedChannel | null;
      if (chan && chan.isTextBased()) {
        await chan.send(text);
      }
    } catch (e) {
      console.warn(`[worker] send fail to channel ${g.scheduleChannelId}:`, e);
    }
  }
}

async function start() {
  await client.login(ENV.DISCORD_TOKEN);
  console.log('Worker Discord client logged in');

  // ⏰ แจ้งเตือนก่อนเกิด 10 นาที
  new Worker(
    'alert',
    async job => {
      const { bossId, bossName, nextSpawnISO } = job.data as {
        bossId: string; bossName: string; nextSpawnISO: string;
      };

      const boss = await prisma.boss.findUnique({
        where: { id: bossId },
        select: { gameId: true, nextSpawnAt: true },
      });
      if (!boss) return;

      // ถ้าเวลาที่คิวเก็บไว้ไม่ตรงกับ DB ปัจจุบัน => ข้าม (งานเก่า)
      if (!boss.nextSpawnAt || dayjs(boss.nextSpawnAt).toISOString() !== dayjs(nextSpawnISO).toISOString()) {
        return;
      }

      const text = `⏰ อีก 10 นาที **${bossName}** จะเกิด (${dayjs(nextSpawnISO).tz(TZ).format('DD/MM/YY HH:mm')})`;
      await broadcastToGameGuilds(boss.gameId, text);
    },
    { connection: redis }
  );

  // 🎯 แจ้งตอนเกิดจริง
  new Worker(
    'spawn',
    async job => {
      const { bossId, bossName, nextSpawnISO } = job.data as {
        bossId: string; bossName: string; nextSpawnISO: string;
      };

      const boss = await prisma.boss.findUnique({
        where: { id: bossId },
        select: { gameId: true, nextSpawnAt: true },
      });
      if (!boss) return;

      // ถ้าเวลาที่คิวเก็บไว้ไม่ตรงกับ DB ปัจจุบัน => ข้าม (งานเก่า)
      if (!boss.nextSpawnAt || dayjs(boss.nextSpawnAt).toISOString() !== dayjs(nextSpawnISO).toISOString()) {
        return;
      }

      const text = `🎯 **${bossName}** เกิดแล้ว (${dayjs(nextSpawnISO).tz(TZ).format('DD/MM/YY HH:mm')})`;
      await broadcastToGameGuilds(boss.gameId, text);

      await prisma.jobLog.updateMany({
        where: { bossId, runAt: new Date(nextSpawnISO), type: 'spawn' },
        data: { status: 'completed' },
      });

      // ถ้าคุณมีฟังก์ชันอัปเดตตารางต่อกิลด์ แนะนำให้เรียกที่นี่แบบ loop ตามกิลด์
      // เช่น updateScheduleForGuild(guildExternalId) เป็นต้น
    },
    { connection: redis }
  );

  // 🧭 fixed-rule tick: คำนวณรอบถัดไปให้บอสที่ใช้ cron
  async function tickFixed() {
    const rules = await prisma.fixedRule.findMany({
      where: { enabled: true },
      include: { boss: true, game: true },
    });

    for (const r of rules) {
      try {
        const it = cronParser.parseExpression(r.cron, { tz: r.tz || TZ });
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