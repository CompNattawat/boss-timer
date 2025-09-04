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

function fmtHM(d: Date | null | undefined) {
  return d ? dayjs(d).tz(TZ).format('HH:mm') : '—';
}
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

function padStartW(s: string, w: number) {
  const len = [...s].length;
  return ' '.repeat(Math.max(0, w - len)) + s;
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

export async function renderTable(gameCode: string): Promise<string> {
  const game = await prisma.game.findUnique({ where: { code: gameCode } });
  if (!game) return `ยังไม่มีเกมรหัส **${gameCode}**`;

  // ดึงบอสทั้งหมดในเกม + fixed rules (enabled เท่านั้น)
  const bosses = await prisma.boss.findMany({
    where: { gameId: game.id },
    orderBy: { name: 'asc' },
  });
  if (!bosses.length) return `เกม **${gameCode}** ยังไม่มีบอส (ลอง /boss add)`;

  const rules = await prisma.fixedRule.findMany({
    where: { gameId: game.id, enabled: true },
    orderBy: { bossId: 'asc' },
  });

  // group rules by bossId
  const rulesByBoss = new Map<string, typeof rules>();
  for (const r of rules) {
    const arr = rulesByBoss.get(r.bossId) ?? [];
    arr.push(r);
    rulesByBoss.set(r.bossId, arr);
  }

  // เตรียมแถว
  type Row = {
    name: string;
    type: 'Daily' | 'Fixed';
    rhText: string;                  // ชม.เกิดซ้ำ (หรือ —)
    lastText: string;               // DD/MM HH:mm หรือ —
    nextText: string;               // YYYY-MM-DD HH:mm หรือ —
    fixSlotsText: string;           // "อ. 18:00, พฤ. 10:30" หรือ —
  };

  const now = dayjs();

  const rows: Row[] = [];

  for (const b of bosses) {
    const fixed = rulesByBoss.get(b.id) ?? [];
    const isFixed = fixed.length > 0;

    let type: Row['type'] = isFixed ? 'Fixed' : 'Daily';

    // ชม.เกิดซ้ำ
    const rhText = isFixed ? '—' : (b.respawnHours != null ? String(b.respawnHours) : '—');

    // เวลา FIX (ถ้ามี) -> แปลงเป็น human list สั้น ๆ
    const fixSlotsText = isFixed
      ? fixed
          .map(r => cronToHuman(r.cron, r.tz || TZ))
          // เอา unique + จำกัดแค่ 2–3 ช่องให้สั้นพออ่าน
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 3)
          .join(', ') || '—'
      : '—';

    // last death
    const lastText = fmtDMHM(b.lastDeathAt);

    // next spawn:
    // - ถ้า Fixed: หา next occurrence ที่ "ใกล้ที่สุด" จากทุก cron
    // - ถ้า Daily: ใช้ nextSpawnAt ตามระบบเดิม
    let nextText = '—';
    if (isFixed) {
      let nearest: Date | null = null;
      for (const r of fixed) {
        try {
          const it = cronParser.parseExpression(r.cron, { tz: r.tz || TZ, currentDate: now.toDate() });
          const n = it.next().toDate();
          if (!nearest || n < nearest) nearest = n;
        } catch {
          // invalid cron — ข้าม
        }
      }
      nextText = fmtYMDHM(nearest);
    } else {
      nextText = fmtYMDHM(b.nextSpawnAt);
    }

    rows.push({
      name: b.name,
      type,
      rhText,
      lastText,
      nextText,
      fixSlotsText,
    });
  }

  // จัดรูปแบบเป็น “ตารางตัวอักษร” ตามตัวอย่าง
  const title = `📅 ตารางบอส (${gameCode}) — เวลาโซน ${TZ}`;
  const updated = `อัปเดตล่าสุด: ${dayjs().tz(TZ).format('DD/MM/YY HH:mm')}`;

  // กำหนดความกว้างคอลัมน์ (ตัวอักษร, แบบคร่าว ๆ)
  const COLS = {
    name: 16,
    type: 7,        // Daily/Fixed
    rh: 10,         // ชม.เกิดซ้ำ
    last: 15,       // ตายล่าสุด
    next: 16,       // เกิดรอบถัดไป
    fix: 24,        // เวลา FIX (ถ้ามี)
  };

  const header =
    padEndW('ชื่อบอส', COLS.name) + '  ' +
    padEndW('ประเภท', COLS.type) + '  ' +
    padEndW('ชม.เกิดซ้ำ', COLS.rh) + '  ' +
    padEndW('ตายล่าสุด', COLS.last) + '  ' +
    padEndW('เกิดรอบถัดไป', COLS.next) + '  ' +
    padEndW('เวลา FIX (ถ้ามี)', COLS.fix);

  const sep = '—'.repeat(COLS.name + COLS.type + COLS.rh + COLS.last + COLS.next + COLS.fix + 10);

  const body = rows
    .map(r =>
      padEndW(r.name, COLS.name) + '  ' +
      padEndW(r.type, COLS.type) + '  ' +
      padEndW(r.rhText, COLS.rh) + '  ' +
      padEndW(r.lastText, COLS.last) + '  ' +
      padEndW(r.nextText, COLS.next) + '  ' +
      padEndW(r.fixSlotsText || '—', COLS.fix)
    )
    .join('\n');

  const notes =
    'หมายเหตุ:\n' +
    '• Daily = ใช้ชั่วโมงเกิดซ้ำคำนวณจากเวลาตายล่าสุด\n' +
    '• Fixed = ใช้ตาราง FIX (cron) หารอบถัดไป ไม่ใช้ชั่วโมงเกิดซ้ำ\n' +
    '• คอลัมน์ “เวลา FIX” แสดงรอบอนาคตถัดไป 1–2 ช่องทางลัดให้อ่านง่าย';

  return [
    title,
    updated,
    '',
    '```',
    header,
    sep,
    body || '(ยังไม่มีบอส)',
    sep,
    '```',
    notes,
  ].join('\n');
}