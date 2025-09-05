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

function fmtDMHM(d: Date | null | undefined) {
  return d ? dayjs(d).tz(TZ).format('DD/MM HH:mm') : '—';
}
function fmtYMDHM(d: Date | null | undefined) {
  return d ? dayjs(d).tz(TZ).format('YYYY-MM-DD HH:mm') : '—';
}

function padEndW(s: string, w: number) {
  // รองรับอักษรไทย (นับเป็นความยาวแบบคร่าว ๆ)
  const len = [...s].length;
  return s + ' '.repeat(Math.max(0, w - len));
}

// แปลง cron slot (เช่น "0 18 * * 2") -> "อ. 18:00"
function cronToHuman(cron: string, tzLabel: string = TZ) {
  // หาวันในสัปดาห์จาก field 5 (DOW) ถ้าเป็น * ให้เว้นวัน
  // รูปแบบมาตรฐาน: m h dom mon dow
  const parts = cron.trim().split(/\s+/);
  const minute = parts[0];
  const hour = parts[1];
  const dow = parts[4];

  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');

  if (dow === '*' || dow === '?' || dow === undefined) {
    return `${hh}:${mm}`;
  }

  // อาจเป็น "2", "2,4", "2-4" — แปลงแบบง่าย: ถ้าหลายค่าให้เลือกตัวแรก
  const first = String(dow).split(',')[0];
  let dowNum = Number(first);
  // cron บางระบบใช้ 0=Sun หรือ 7=Sun; normalize
  if (dowNum === 7) dowNum = 0;
  const dayText = Number.isInteger(dowNum) ? TH_DOW[dowNum] ?? '' : '';
  return dayText ? `${dayText} ${hh}:${mm}` : `${hh}:${mm}`;
}

// type
type Row = {
  name: string;
  rhText: string;
  lastText: string;
  nextText: string;
  fixSlotsText: string;
};

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

  const bosses = await prisma.boss.findMany({ where: { gameId: game.id }, orderBy: { name: 'asc' } });
  const rules = await prisma.fixedRule.findMany({ where: { gameId: game.id, enabled: true }, orderBy: { bossId: 'asc' } });

  const rulesByBoss = new Map<string, typeof rules>();
  for (const r of rules) {
    const arr = rulesByBoss.get(r.bossId) ?? [];
    arr.push(r);
    rulesByBoss.set(r.bossId, arr);
  }
    const dailyRows: Row[] = bosses.filter(b => !rulesByBoss.has(b.id)).map(b => ({
      name: b.name,
      rhText: String(b.respawnHours ?? '—'),
      lastText: fmtDMHM(b.lastDeathAt),
      nextText: fmtYMDHM(b.nextSpawnAt),
      fixSlotsText: '—'
    }));
    
    const fixedRows: Row[] = bosses.filter(b => rulesByBoss.has(b.id)).map(b => {
      const rules = rulesByBoss.get(b.id)!;
      const nearest = rules.map(r => cronParser.parseExpression(r.cron, { tz: r.tz || TZ }).next().toDate())
                           .sort((a, b) => +a - +b)[0];
      return {
        name: b.name,
        rhText: '—',
        lastText: fmtDMHM(b.lastDeathAt),
        nextText: fmtYMDHM(nearest),
        fixSlotsText: rules.map(r => cronToHuman(r.cron, r.tz || TZ)).join(', ')
      };
    });

    //จัดรูปแบบเป็น “ตารางตัวอักษร” ตามตัวอย่าง
    const title = (label: string) =>
      `📅 ตารางบอส (${gameCode}) — ${label}\nอัปเดตล่าสุด: ${dayjs().tz(TZ).format('DD/MM/YY HH:mm')}`;
    const updated = `อัปเดตล่าสุด: ${dayjs().tz(TZ).format('DD/MM/YY HH:mm')}`;

    return {
      daily: [title, updated, '', wrapBlock(buildDailyTableRows(dailyRows))].join('\n'),
      fixed: [wrapBlock(buildFixedTableRows(fixedRows)), 'หมายเหตุ: Fixed = ใช้ตาราง cron ไม่ใช่ respawnHours'].join('\n'),
    };
}