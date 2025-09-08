// src/services/schedule-image-data.ts
import cronParser from 'cron-parser';
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { prisma } from '../lib/prisma.js';

dayjs.extend(utc); dayjs.extend(tz);
const TZ = 'Asia/Bangkok';
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function cronToHuman(cron: string, tzLabel = TZ) {
  const [m, h, , , dow] = cron.trim().split(/\s+/);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (!dow || dow === '*' || dow === '?') return `${hh}:${mm}`;
  let d = Number(String(dow).split(',')[0]);
  if (d === 7) d = 0;
  const dayText = Number.isInteger(d) ? (TH_DOW[d] ?? '') : '';
  return dayText ? `${dayText} ${hh}:${mm}` : `${hh}:${mm}`;
}

function getNextPrevFromCron(crons: { cron: string; tz?: string | null }[]) {
  const now = new Date();
  let next: Date | null = null;
  let prev: Date | null = null;

  for (const r of crons) {
    try {
      const it = cronParser.parseExpression(r.cron, {
        tz: r.tz || TZ,
        currentDate: now,
      });
      const n = it.next().toDate();
      if (!next || n < next) next = n;
    } catch {}
    try {
      const it2 = cronParser.parseExpression(r.cron, {
        tz: r.tz || TZ,
        currentDate: now,
      });
      const p = it2.prev().toDate();
      if (!prev || p > prev) prev = p;
    } catch {}
  }
  return { next, prev };
}

export async function buildScheduleImageInput(gameCode: string) {
  const game = await prisma.game.findUnique({ where: { code: gameCode } });
  if (!game) throw new Error(`ไม่พบเกม ${gameCode}`);

  const bosses = await prisma.boss.findMany({
    where: { gameId: game.id },
    orderBy: { name: 'asc' },
  });

  const rules = await prisma.fixedRule.findMany({
    where: { gameId: game.id, enabled: true },
    orderBy: { bossId: 'asc' },
  });

  const rulesByBoss = new Map<string, typeof rules>();
  for (const r of rules) {
    const arr = rulesByBoss.get(r.bossId) ?? [];
    arr.push(r);
    rulesByBoss.set(r.bossId, arr);
  }

  const daily: Array<{
    name: string;
    respawnHours: number;
    lastDeath?: string | Date;
    nextSpawn?: string | Date;
  }> = [];

  const fixed: Array<{
    name: string;
    lastDeath?: string | Date;
    nextSpawn?: string | Date;
    slots: string[];
    forceLive?: boolean; // << ใช้ชี้ว่าต้องแสดง “เกิดแล้ว” ถ้ายังไม่อัปเดต
  }> = [];

  for (const b of bosses) {
    const fixedRules = rulesByBoss.get(b.id) ?? [];
    const isFixed = fixedRules.length > 0;

    const showLast = b.lastDeathAt ?? undefined;
    let forceLive = false;
    let next: Date | undefined;

    if (isFixed) {
      // หา nearest ตาม cron
      for (const r of fixedRules) {
        const it = cronParser.parseExpression(r.cron, { tz: r.tz || TZ, currentDate: new Date() });
        const n = it.next().toDate();
        if (!next || n < next) next = n;
      }
      // ถ้าไม่เคยมี lastDeath ให้ถือว่า “ถึงรอบนี้แล้ว” => เกิด
      if (!showLast && next) {
        forceLive = dayjs().tz(TZ).isSameOrAfter(dayjs(next).tz(TZ));
      }
      fixed.push({
        name: b.name,
        lastDeath: showLast,
        nextSpawn: next,
        slots: [...new Set(fixedRules.map(r => cronToHuman(r.cron, r.tz || TZ)))].slice(0, 3),
        forceLive,
      });
    }
  }

  return {
    title: `BOSS RESPAWN TIMER — ${gameCode}`,
    subtitle: `อัปเดต: ${dayjs().tz(TZ).format('DD/MM/YY HH:mm')}`,
    tzLabel: TZ,
    daily,
    fixed,
  };
}