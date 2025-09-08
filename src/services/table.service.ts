// src/services/table.service.ts (หรือไฟล์ที่คุณเก็บ renderTable อยู่)
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import cronParser from 'cron-parser';
import { prisma } from '../lib/prisma.js';

dayjs.extend(utc);
dayjs.extend(tz);

const TZ = 'Asia/Bangkok';

// 0..6 (Sun..Sat) -> Thai short
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function fmtDMYHM(d: Date | null | undefined) {
  return d ? dayjs(d).tz(TZ).format('DD/MM/YYYY HH:mm') : '—';
}

function padEndW(s: string, w: number) {
  // รองรับอักษรไทย (นับเป็นความยาวแบบคร่าว ๆ)
  const len = [...s].length;
  return s + ' '.repeat(Math.max(0, w - len));
}

// แปลง cron slot (เช่น "0 18 * * 2") -> "อ. 18:00"
function cronToHuman(cron: string) {
  const parts = cron.trim().split(/\s+/);
  const minute = parts[0], hour = parts[1], dow = parts[4];
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  if (!dow || dow === '*' || dow === '?') return `${hh}:${mm}`;
  const first = String(dow).split(',')[0];
  let dowNum = Number(first);
  if (dowNum === 7) dowNum = 0;
  const dayText = Number.isInteger(dowNum) ? (TH_DOW[dowNum] ?? '') : '';
  return dayText ? `${dayText} ${hh}:${mm}` : `${hh}:${mm}`;
}

// type
type Row = {
  name: string;
  rhText: string;
  lastText: string;
  nextText: string;
  fixSlotsText: string;
  nextDate: Date | null;   // <-- ใช้เรียง
};

function buildHeader(gameCode: string) {
  return `📅 ตารางบอส (${gameCode})`;
}

function getNextPrevFromCron(crons: { cron: string; tz?: string | null }[]) {
  const now = new Date();
  let next: Date | null = null;
  let prev: Date | null = null;
  for (const r of crons) {
    try {
      const it = cronParser.parseExpression(r.cron, { tz: r.tz || TZ, currentDate: now });
      const n = it.next().toDate();
      if (!next || n < next) next = n;
    } catch {}
    try {
      const it2 = cronParser.parseExpression(r.cron, { tz: r.tz || TZ, currentDate: now });
      const p = it2.prev().toDate();
      if (!prev || p > prev) prev = p;
    } catch {}
  }
  return { next, prev };
}

// แปลง daily bosses -> string table
function buildDailyTableRows(bosses: any[]): string {
  const COLS = { name: 16, rh: 5, last: 15, next: 16 };
  const header =
    padEndW('ชื่อบอส', COLS.name) + '  ' +
    padEndW('RH', COLS.rh) + '  ' +
    padEndW('ตายล่าสุด', COLS.last) + '  ' +
    padEndW('เกิดรอบถัดไป', COLS.next);

  const sep = '—'.repeat(COLS.name + COLS.rh + COLS.last + COLS.next + 8);

  const body = bosses.map(b => {
    return padEndW(b.name, COLS.name) + '  ' +
      padEndW(b.rhText, COLS.rh) + '  ' +
      padEndW(b.lastText, COLS.last) + '  ' +
      padEndW(b.nextText, COLS.next);
  }).join('\n');

  return [header, sep, body || '(ยังไม่มีบอส Daily)', sep].join('\n');
}

// แปลง fixed bosses -> string table
function buildFixedTableRows(rows: Row[]): string {
  const COLS = { name: 16, last: 15, next: 16, fix: 24 };
  const header =
    padEndW('ชื่อบอส', COLS.name) + '  ' +
    padEndW('ตายล่าสุด', COLS.last) + '  ' +
    padEndW('เกิดรอบถัดไป', COLS.next) + '  ' +
    padEndW('เวลา FIX', COLS.fix);

  const sep = '—'.repeat(COLS.name + COLS.last + COLS.next + COLS.fix + 8);

  const body = rows.map(r => {
    return padEndW(r.name, COLS.name) + '  ' +
      padEndW(r.lastText, COLS.last) + '  ' +
      padEndW(r.nextText, COLS.next) + '  ' +
      padEndW(r.fixSlotsText, COLS.fix);
  }).join('\n');

  return [header, sep, body || '(ยังไม่มีบอส Fixed)', sep].join('\n');
}

function wrapBlock(s: string) {
  return '```\n' + s + '\n```';
}

export async function renderTablesSplit(gameCode: string): Promise<{daily: string, fixed: string}> {
  const game = await prisma.game.findUnique({ where: { code: gameCode } });
  if (!game) return { daily: `ยังไม่มีเกมรหัส **${gameCode}**`, fixed: '' };

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

  // DAILY: ไม่มี fixed rule
  const dailyRows: Row[] = bosses
    .filter(b => !rulesByBoss.has(b.id))
    .map(b => ({
      name: b.name,
      rhText: String(b.respawnHours ?? '—'),
      lastText: fmtDMYHM(b.lastDeathAt),
      nextText: fmtDMYHM(b.nextSpawnAt),
      fixSlotsText: '—',
      nextDate: b.nextSpawnAt ?? null,
    }))
    .sort((a, b) => {
      const ax = a.nextDate ? +a.nextDate : Infinity;
      const bx = b.nextDate ? +b.nextDate : Infinity;
      return ax - bx;
    });

  // FIXED: มี fixed rule → หาเวลาเกิดถัดไปที่ใกล้ที่สุด แล้ว sort
  const fixedRows: Row[] = bosses
    .filter(b => rulesByBoss.has(b.id))
    .map(b => {
      const bossRules = rulesByBoss.get(b.id)!;
      let nearest: Date | null = null;
      for (const r of bossRules) {
        try {
          const n = cronParser.parseExpression(r.cron, { tz: r.tz || TZ }).next().toDate();
          if (!nearest || n < nearest) nearest = n;
        } catch { /* ignore invalid cron */ }
      }
      return {
        name: b.name,
        rhText: '—',
        lastText: fmtDMYHM(b.lastDeathAt),
        nextText: fmtDMYHM(nearest),
        fixSlotsText: bossRules.map(r => cronToHuman(r.cron)).join(', '),
        nextDate: nearest,
      };
    })
    .sort((a, b) => {
      const ax = a.nextDate ? +a.nextDate : Infinity;
      const bx = b.nextDate ? +b.nextDate : Infinity;
      return ax - bx;
    });

  const title = buildHeader(gameCode);
  const updated = `อัปเดตล่าสุด: ${dayjs().tz(TZ).format('DD/MM/YYYY HH:mm')}`;

  return {
    daily: [title, updated, '', wrapBlock(buildDailyTableRows(dailyRows))].join('\n'),
    fixed: ['📌 ตาราง Fixed Boss', wrapBlock(buildFixedTableRows(fixedRows)), 'หมายเหตุ: Fixed = ใช้ตาราง cron ไม่ใช่ respawnHours'].join('\n'),
  };
}