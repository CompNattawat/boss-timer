import 'dotenv/config';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';
dayjs.extend(utc); dayjs.extend(tz);

import { Worker } from 'bullmq';
import { connection } from './queues';
import { prisma } from '../lib/prisma';
import { ENV } from '../lib/env';
import cronParser from 'cron-parser';
import { scheduleJobs } from '../services/schedule.service';
import { client } from '../lib/client';
import { updateScheduleMessage } from '../services/discord.service';
import { TextChannel } from 'discord.js';

client.login(ENV.DISCORD_TOKEN).then(() =>
  console.log('Worker Discord client logged in')
);

// Process alert jobs
new Worker(
  'alert',
  async job => {
    const { bossId, bossName, nextSpawnISO } = job.data as {
      bossId: string;
      bossName: string;
      nextSpawnISO: string;
    };
    const channel = (await client.channels.fetch(
      ENV.DISCORD_SCHEDULE_CHANNEL_ID
    )) as TextChannel;
    await channel.send(
      `⏰ อีก 10 นาที **${bossName}** จะเกิด (${dayjs(nextSpawnISO)
        .tz(ENV.TZ)
        .format('DD/MM/YY HH:mm')})`
    );
  },
  { connection }
);

// Process spawn jobs
new Worker(
  'spawn',
  async job => {
    const { bossId, bossName, nextSpawnISO } = job.data as {
      bossId: string;
      bossName: string;
      nextSpawnISO: string;
    };
    const channel = (await client.channels.fetch(
      ENV.DISCORD_SCHEDULE_CHANNEL_ID
    )) as TextChannel;
    await channel.send(
      `🎯 **${bossName}** เกิดแล้ว (${dayjs(nextSpawnISO)
        .tz(ENV.TZ)
        .format('DD/MM/YY HH:mm')})`
    );
    await prisma.jobLog.updateMany({
      where: { bossId, runAt: new Date(nextSpawnISO), type: 'spawn' },
      data: { status: 'completed' },
    });
    await updateScheduleMessage();
  },
  { connection }
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