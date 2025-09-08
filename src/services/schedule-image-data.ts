// src/services/schedule-image-data.ts
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import cronParser from 'cron-parser';
import { prisma } from '../lib/prisma.js';

dayjs.extend(utc); dayjs.extend(tz);

const TZ = 'Asia/Bangkok';
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const fmtDMYHM = (d?: Date | null) =>
  d ? dayjs(d).tz(TZ).format('DD/MM/YYYY HH:mm') : '—';

function cronToHuman(cron: string) {
  const [m, h, , , dow] = cron.trim().split(/\s+/);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (!dow || dow === '*' || dow === '?') return `${hh}:${mm}`;
  let d = Number(String(dow).split(',')[0]);
  if (d === 7) d = 0;
  const dayText = Number.isInteger(d) ? (TH_DOW[d] ?? '') : '';
  return dayText ? `${dayText} ${hh}:${mm}` : `${hh}:${mm}`;
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

  // ---- เตรียม daily (ไม่มี fixed rule) พร้อม “คีย์เวลา” สำหรับเรียง
  const dailyRaw = bosses
    .filter(b => !(rulesByBoss.has(b.id)))
    .map(b => {
      const nextDate = b.nextSpawnAt ?? null;
      return {
        name: b.name,
        respawnHours: b.respawnHours ?? 0,
        lastDeathStr: fmtDMYHM(b.lastDeathAt),
        nextSpawnStr: fmtDMYHM(nextDate),
        _nextDate: nextDate as Date | null,
      };
    })
    .sort((a, b) => {
      const ax = a._nextDate ? +a._nextDate : Infinity;
      const bx = b._nextDate ? +b._nextDate : Infinity;
      return ax - bx;
    });

  // ---- เตรียม fixed (มี fixed rule) หา “รอบถัดไปที่ใกล้สุด” + เรียง
  const fixedRaw = bosses
    .filter(b => rulesByBoss.has(b.id))
    .map(b => {
      const fixedRules = rulesByBoss.get(b.id)!;
      let nearest: Date | null = null;
      const slotLabels: string[] = [];

      for (const r of fixedRules) {
        try {
          const it = cronParser.parseExpression(r.cron, {
            tz: r.tz || TZ,
            currentDate: new Date(),
          });
          const n = it.next().toDate();
          if (!nearest || n < nearest) nearest = n;
          slotLabels.push(cronToHuman(r.cron));
        } catch { /* ignore bad cron */ }
      }

      // unique + limit 3
      const slots = [...new Set(slotLabels)].slice(0, 3);

      return {
        name: b.name,
        nextSpawnStr: fmtDMYHM(nearest),
        slots,
        _nextDate: nearest as Date | null,
      };
    })
    .sort((a, b) => {
      const ax = a._nextDate ? +a._nextDate : Infinity;
      const bx = b._nextDate ? +b._nextDate : Infinity;
      return ax - bx;
    });

  // ---- map เป็นรูปแบบที่ renderer ต้องการ
  const daily = dailyRaw.map(r => ({
    name: r.name,
    respawnHours: r.respawnHours,
    lastDeath: r.lastDeathStr,               // DD/MM/YYYY HH:mm
    nextSpawn: r.nextSpawnStr,               // DD/MM/YYYY HH:mm
  }));

  const fixed = fixedRaw.map(r => ({
    name: r.name,
    nextSpawn: r.nextSpawnStr,               // DD/MM/YYYY HH:mm
    slots: r.slots,                          // ['จ. 18:00', ...]
  }));

  return {
    title: `BOSS RESPAWN TIMER — ${gameCode}`,
    subtitle: `อัปเดต: ${dayjs().tz(TZ).format('DD/MM/YYYY HH:mm')}`,
    tzLabel: TZ,
    daily,
    fixed,
  };
}