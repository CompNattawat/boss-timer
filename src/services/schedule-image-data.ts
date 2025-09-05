// src/services/schedule-image-data.ts
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import cronParser from 'cron-parser';
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

  const daily = [];
  const fixed = [];

  for (const b of bosses) {
    const fixedRules = rulesByBoss.get(b.id) ?? [];
    const isFixed = fixedRules.length > 0;

    if (!isFixed) {
      daily.push({
        name: b.name,
        respawnHours: b.respawnHours ?? 0,
        lastDeath: b.lastDeathAt ? dayjs(b.lastDeathAt).tz(TZ).format('DD/MM HH:mm') : '—',
        nextSpawn: b.nextSpawnAt ? dayjs(b.nextSpawnAt).tz(TZ).format('YYYY-MM-DD HH:mm') : '—',
      });
    } else {
      let nearest: Date | null = null;
      const slots: string[] = [];
      for (const r of fixedRules) {
        try {
          const it = cronParser.parseExpression(r.cron, { tz: r.tz || TZ, currentDate: new Date() });
          const n = it.next().toDate();
          if (!nearest || n < nearest) nearest = n;
          slots.push(cronToHuman(r.cron, r.tz || TZ));
        } catch { /* ignore bad cron */ }
      }
      fixed.push({
        name: b.name,
        nextSpawn: nearest ? dayjs(nearest).tz(TZ).format('YYYY-MM-DD HH:mm') : '—',
        slots: [...new Set(slots)].slice(0, 3),
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