// src/services/schedule-image-data.ts
import cronParser from 'cron-parser';
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { prisma } from '../lib/prisma.js';

dayjs.extend(utc); dayjs.extend(tz);

import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';
dayjs.extend(isSameOrAfter);


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

export function getNextPrevFromCron(
  crons: { cron: string; tz?: string | null }[],
  lastDeathAt?: Date | null,
  now: Date = new Date()
): { next: Date | null; prev: Date | null; live: boolean } {
  let next: Date | null = null;
  let prev: Date | null = null;

  for (const r of crons) {
    const tz = r.tz || TZ;

    // next (ถัดจาก "ตอนนี้")
    try {
      const it = cronParser.parseExpression(r.cron, { tz, currentDate: now });
      const n = it.next().toDate();
      if (!next || n < next) next = n;
    } catch { /* ignore */ }

    // prev (ก่อน "ตอนนี้")
    try {
      const it2 = cronParser.parseExpression(r.cron, { tz, currentDate: now });
      const p = it2.prev().toDate();
      if (!prev || p > prev) prev = p;
    } catch { /* ignore */ }
  }

  // ตัดสินสถานะจาก lastDeathAt เทียบกับ prev
  // - ไม่มี prev (cron เพี้ยน) => live=false ปลอดภัยไว้ก่อน
  // - ไม่มี lastDeathAt => ถ้าเลย prev มาแล้วให้ถือว่าเกิดแล้ว
  // - มี lastDeathAt:
  //     lastDeathAt < prev  => รอบ prev เกิดขึ้น "หลัง" เวลาตายที่รู้ => ควรเป็น "เกิดแล้ว"
  //     lastDeathAt >= prev => มีการตายหลังเกิดล่าสุด => "รอเกิด" (จนถึง next)
  let live = false;
  if (prev) {
    if (!lastDeathAt) {
      live = true; // ยังไม่เคยบันทึกตาย แต่ผ่านรอบเกิดล่าสุดมาแล้ว ⇒ น่าจะเกิดอยู่
    } else {
      live = lastDeathAt < prev;
    }
  }

  return { next, prev, live };
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

    if (isFixed) {
      const { next, prev, live } = getNextPrevFromCron(
        fixedRules.map(r => ({ cron: r.cron, tz: r.tz || TZ })),
        showLast ?? null
      );
    
      fixed.push({
        name: b.name,
        lastDeath: showLast,
        nextSpawn: next ?? undefined,
        slots: [...new Set(fixedRules.map(r => cronToHuman(r.cron, r.tz || TZ)))].slice(0, 3),
        forceLive: live, // live = true แปลว่า “รอบเกิดล่าสุดเกิดแล้ว แต่ยังไม่กดตายใหม่”
      });
    }
    else {
      daily.push({
        name: b.name,
        respawnHours: b.respawnHours ?? 0,
        lastDeath: showLast,
        nextSpawn: b.nextSpawnAt ?? undefined,
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