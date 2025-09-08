// src/graphics/renderScheduleImage.ts
import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';

type DailyRow = {
  name: string;
  respawnHours: number;
  lastDeath?: string;
  nextSpawn?: string;
};

type FixedRow = {
  name: string;
  nextSpawn?: string;
  slots: string[];
};

export type ScheduleImageInput = {
  title?: string;
  subtitle?: string;
  tzLabel?: string;
  daily: DailyRow[];
  fixed: FixedRow[];
};

export function registerThaiFonts() {
  const base = path.resolve('/app/fonts/Prompt');
  const candidates: [string, string][] = [
    ['Prompt-Regular.ttf', 'Prompt'],
    ['Prompt-Bold.ttf', 'PromptBold'],
  ];

  for (const [file, family] of candidates) {
    const p = path.join(base, file);
    if (fs.existsSync(p)) {
      try {
        // ✅ family เป็น string
        GlobalFonts.registerFromPath(p, family);
        console.log(`[fonts] ✅ registered ${family} -> ${p}`);
      } catch (e) {
        console.warn(`[fonts] ⚠️ failed ${family}:`, e);
      }
    } else {
      console.warn(`[fonts] ❌ not found: ${p}`);
    }
  }
}
registerThaiFonts();

const FONT_UI = GlobalFonts.has('Prompt') ? 'Prompt' : 'sans-serif';
const FONT_BOLD = GlobalFonts.has('PromptSemi')
  ? 'PromptSemi'
  : GlobalFonts.has('PromptBold')
  ? 'PromptBold'
  : 'sans-serif';

// ---------- Theme ----------
const THEME = {
  bg: '#F5F7FB',
  headerGradTop: '#8B5CF6',
  headerGradBot: '#EC4899',
  headerCard: '#FFFFFF',

  text: '#111827',
  textSub: '#4B5563',
  textDim: '#6B7280',

  tableBg: '#FFFFFF',
  tableHeaderBg: '#EEF2FF',
  tableHeaderText: '#111827',
  rowAlt: '#FAFAFF',
  grid: '#E5E7EB',

  badgeBg: '#EEF2FF',
  badgeText: '#4F46E5',

  ok: '#065F46',        // for nextSpawn text
  okSoft: '#10B981',    // green-500 (badge text)
  okBg: '#DCFCE7',      // green-100 (badge bg)

  danger: '#EF4444',    // red-500 (badge text)
  dangerBg: '#FEE2E2',  // red-100 (badge bg)

  card: '#FFFFFF',
  cardShadow: 'rgba(0,0,0,0.08)',
  slotBadgeBg: '#F3F4F6',
  slotBadgeText: '#374151',
};

// ---- helpers (แทนของเดิมทั้งฟังก์ชัน) ----
function statusOf(nextSpawnStr?: string) {
  if (!nextSpawnStr || nextSpawnStr === '—') return { label: 'รอเกิด', live: false };
  const next = dayjs.tz(nextSpawnStr, 'YYYY-MM-DD HH:mm', 'Asia/Bangkok');
  if (!next.isValid()) return { label: 'รอเกิด', live: false };
  const live = !dayjs().tz('Asia/Bangkok').isBefore(next); // ถึง/เลยเวลา = เกิด
  return { label: live ? 'เกิด' : 'รอเกิด', live };
}

function drawStatusPill(ctx: SKRSContext2D, text: string, x: number, y: number, live: boolean) {
  const padX = 10, h = 26, w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = live ? '#DCFCE7' : '#FEE2E2'; // เขียวอ่อน/แดงอ่อน
  roundRect(ctx, x, y, w, h, 12, true, false);
  setFont(ctx, 13, true);
  ctx.fillStyle = live ? '#059669' : '#DC2626'; // เขียวเข้ม/แดงเข้ม
  ctx.fillText(text, x + padX, y + 18);
}


/* =========================
   Main renderer
========================= */
export function renderScheduleImage({
  title = 'BOSS RESPAWN TIMER',
  subtitle,
  daily,
  fixed,
}: ScheduleImageInput) {
  // Layout sizes
  const W = 1100;
  const headerH = 120;

  const rowH = 52;
  const tablePad = 20;
  const dailyHeight = 70 + (daily.length || 1) * rowH + 30;

  const fixedRows = Math.max(1, Math.ceil(fixed.length / 2)); // 2 คอลัมน์เพื่อความใหญ่
  const fixedCardH = 90;
  const fixedGap = 16;
  const fixedHeight = 60 + fixedRows * (fixedCardH + fixedGap) - fixedGap + 20;

  const H = headerH + 90 + dailyHeight + fixedHeight + 30;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient header
  const grad = ctx.createLinearGradient(0, 0, 0, headerH + 50);
  grad.addColorStop(0, THEME.headerGradTop);
  grad.addColorStop(1, THEME.headerGradBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH + 50);

  // Canvas bg
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, headerH + 50, W, H - (headerH + 50));

  // Header card
  ctx.fillStyle = THEME.headerCard;
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 14;
  roundRect(ctx, 18, 18, W - 36, headerH, 18, true, false);
  ctx.shadowBlur = 0;

  // Title + subtitle
  setFont(ctx, 32, true);
  ctx.fillStyle = THEME.text;
  centerText(ctx, title, W / 2, 65);

  if (subtitle) {
    setFont(ctx, 14, false);
    ctx.fillStyle = THEME.textSub;
    centerText(ctx, subtitle, W / 2, 95);
  }

  // === Daily Table ===
  let y = headerH + 90;
  drawSectionHeader(ctx, 'Daily Bosses (บอสรายวัน)', 28, y);
  y += 6;

  const tableX = 20;
  const tableW = W - 40;

  // card
  ctx.fillStyle = THEME.tableBg;
  ctx.shadowColor = THEME.cardShadow;
  ctx.shadowBlur = 10;
  roundRect(ctx, tableX, y + 10, tableW, dailyHeight, 12, true, false);
  ctx.shadowBlur = 0;

  // header strip
  const headerStripY = y + 20;
  ctx.fillStyle = THEME.tableHeaderBg;
  roundRect(ctx, tableX + tablePad, headerStripY, tableW - tablePad * 2, 40, 8, true, false);

  // ==== Daily Table header ====

  // จัดระยะด้วย “ความกว้างคอลัมน์” ให้ไม่ชนกัน
  const left = tableX + tablePad + 10;
  const widths = {
    name: 420,      // ชื่อ
    respawn: 120,   // รอบเกิด
    last: 190,      // เวลาตายล่าสุด
    next: 200,      // เกิดรอบถัดไป
    status: 100,    // สถานะ
  };
  // จุดวางข้อความ (ชิดซ้ายของแต่ละคอลัมน์)
  const cx = {
    name: left,
    respawn: left + widths.name,
    last:    left + widths.name + widths.respawn,
    next:    left + widths.name + widths.respawn + widths.last,
    status:  left + widths.name + widths.respawn + widths.last + widths.next,
  };

  setFont(ctx, 16, true);
  ctx.fillStyle = THEME.tableHeaderText;
  ctx.fillText('ชื่อบอส', cx.name, headerStripY + 26);
  ctx.fillText('รอบเกิด', cx.respawn, headerStripY + 26);
  ctx.fillText('เวลาตายล่าสุด', cx.last, headerStripY + 26);
  ctx.fillText('เกิดรอบถัดไป', cx.next, headerStripY + 26);

  // จัดหัวคอลัมน์ "สถานะ" ให้อยู่กึ่งกลางคอลัมน์
  {
    const prev = ctx.textAlign;
    ctx.textAlign = 'center';
    ctx.fillText('สถานะ', cx.status + widths.status / 2, headerStripY + 26);
    ctx.textAlign = prev;
  }

  // ===== rows =====
  // ขยับลงเพิ่ม 6–8px กันภาพติดหัวตาราง
  let ry = headerStripY + 48;  // เดิม +40
  for (let i = 0; i < Math.max(1, daily.length); i++) {
    const d = daily[i];
    const isAlt = i % 2 === 0;
  
    if (isAlt) {
      ctx.fillStyle = THEME.rowAlt;
      roundRect(ctx, tableX + tablePad, ry + 6, tableW - tablePad * 2, rowH - 12, 8, true, false);
    }

    if (d) {
      // ชื่อ (ตัดความยาวถ้าเกินคอลัมน์)
      setFont(ctx, 16, true);
      ctx.fillStyle = THEME.text;
      drawTrimmed(ctx, d.name, cx.name, ry + 32, widths.name - 20);

      // รอบเกิด
      setFont(ctx, 14, true);
      ctx.fillStyle = THEME.badgeText;
      drawChip(ctx, `${d.respawnHours} ชม.`, cx.respawn - 4, ry + 12);

      // เวลาตายล่าสุด
      setFont(ctx, 15, false);
      ctx.fillStyle = THEME.textSub;
      drawTrimmed(ctx, d.lastDeath ?? '—', cx.last, ry + 32, widths.last - 20);

      // เกิดรอบถัดไป
      setFont(ctx, 15, true);
      ctx.fillStyle = d.nextSpawn ? THEME.ok : THEME.textDim;
      drawTrimmed(ctx, d.nextSpawn ?? '—', cx.next, ry + 32, widths.next - 20);

      // สถานะ (เขียว=เกิด / แดง=รอเกิด) วาดแบบ pill กลางคอลัมน์
      const st = statusOf(d.nextSpawn);

      setFont(ctx, 13, true);
      const pillW = ctx.measureText(st.label).width + 20;
      const pillX = cx.status + (widths.status - pillW) / 2;
      drawStatusPill(ctx, st.label, Math.floor(pillX), ry + 14, st.live);
    }

    // เส้นคั่น
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX + tablePad, ry + rowH);
    ctx.lineTo(tableX + tableW - tablePad, ry + rowH);
    ctx.stroke();

    ry += rowH;
  }

  y = ry + 26;

  // === Fixed Cards ===
  drawSectionHeader(ctx, 'Fixed-time Bosses (บอสรายเวลา)', 28, y);
  y += 10;

  const column = 2;                         // 2 คอลัมน์อ่านง่าย
  const cardW = Math.floor((W - 40 - fixedGap * (column - 1)) / column);
  let fx = 20, fy = y + 16;

  for (let i = 0; i < Math.max(1, fixed.length); i++) {
    const f = fixed[i];

    ctx.fillStyle = THEME.card;
    ctx.shadowColor = THEME.cardShadow;
    ctx.shadowBlur = 8;
    roundRect(ctx, fx, fy, cardW, fixedCardH, 12, true, false);
    ctx.shadowBlur = 0;

    if (f) {
      setFont(ctx, 18, true);
      ctx.fillStyle = THEME.text;
      drawTrimmed(ctx, f.name, fx + 16, fy + 30, cardW - 32 - 80); // ชื่อไม่ชน pill

      setFont(ctx, 14, true);
      ctx.fillStyle = f.nextSpawn ? THEME.ok : THEME.textDim;
      ctx.fillText(
        f.nextSpawn ? `รอบหน้า: ${f.nextSpawn}` : 'รอบหน้า: -',
        fx + 16,
        fy + 56
      );

      // --- ก่อนวาดภายในการ์ดแต่ละใบ ---
      const st = statusOf(f.nextSpawn); // { label: 'รอเกิด'|'เกิด', live: boolean }

      // วาดสถานะมุมขวาบนของการ์ด (วาดครั้งเดียวพอ!)
      setFont(ctx, 13, true);
      const pillW = ctx.measureText(st.label).width + 20;
      drawStatusPill(ctx, st.label, fx + cardW - pillW - 14, fy + 10, st.live);

      // แล้วค่อยวาดชื่อ/เวลารอบหน้า ตามเดิม
      setFont(ctx, 18, true);
      ctx.fillStyle = THEME.text;
      ctx.fillText(f.name, fx + 16, fy + 30);

      setFont(ctx, 14, true);
      ctx.fillStyle = f.nextSpawn ? THEME.ok : THEME.textDim;
      ctx.fillText(
        f.nextSpawn ? `รอบหน้า: ${f.nextSpawn}` : 'รอบหน้า: -',
        fx + 16,
        fy + 56
      );


      // วาด slot badges (อยู่นอกเหนือ pill แล้ว)
      let bx = fx + 16;
      const by = fy + 74;
      setFont(ctx, 12, false);
      const slots = f.slots?.slice(0, 3) ?? [];
      if (slots.length === 0) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('-', bx, by);
      } else {
        for (const s of slots) {
          drawSlotBadge(ctx, s, bx, by - 14);
          bx += ctx.measureText(s).width + 8 + 14;
          if (bx > fx + cardW - 80) break;
        }
      }
    }

    // next position
    if (i % column === column - 1) {
      fx = 20;
      fy += fixedCardH + fixedGap;
    } else {
      fx += cardW + fixedGap;
    }
  }

  return new AttachmentBuilder(Buffer.from(canvas.toBuffer('image/png')), {
    name: 'schedule.png',
  });
}

/* =========================
   Helpers
========================= */
// ---------- Helpers ----------
function setFont(ctx: SKRSContext2D, px: number, bold = false) {
  const fam = bold ? FONT_BOLD : FONT_UI;
  ctx.font = `${bold ? 'bold ' : ''}${px}px ${fam}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
function centerText(ctx: SKRSContext2D, txt: string, cx: number, y: number) {
  const w = ctx.measureText(txt).width;
  ctx.fillText(txt, cx - w / 2, y);
}
function roundRect(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number, r: number,
  fill = false, stroke = false
) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
function drawSectionHeader(ctx: SKRSContext2D, text: string, x: number, y: number) {
  // แถบเล็กโค้ง ๆ + ข้อความ
  ctx.fillStyle = THEME.tableHeaderBg;
  roundRect(ctx, x, y - 24, 190, 28, 12, true, false);

  setFont(ctx, 14, true);
  ctx.fillStyle = THEME.badgeText;
  ctx.fillText(text, x + 14, y - 6);
}
function drawChip(ctx: SKRSContext2D, text: string, x: number, y: number) {
  const padX = 10;
  const h = 24;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = THEME.badgeBg;
  roundRect(ctx, x, y, w, h, 12, true, false);
  setFont(ctx, 13, true);
  ctx.fillStyle = THEME.badgeText;
  ctx.fillText(text, x + padX, y + 17);
}
function drawSlotBadge(ctx: SKRSContext2D, text: string, x: number, y: number) {
  const padX = 8;
  const h = 22;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = THEME.slotBadgeBg;
  roundRect(ctx, x, y, w, h, 10, true, false);
  setFont(ctx, 12, false);
  ctx.fillStyle = THEME.slotBadgeText;
  ctx.fillText(text, x + padX, y + 16);
}

function drawTrimmed(ctx: SKRSContext2D, text: string, x: number, y: number, maxW: number) {
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, x, y);
    return;
  }
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) {
    s = s.slice(0, -1);
  }
  ctx.fillText(s + '…', x, y);
}