// src/graphics/renderScheduleImage.ts
import { createCanvas, SKRSContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

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

const FONT_UI = 'sans-serif';


/* =========================
   Main renderer
========================= */
export function renderScheduleImage({
  title = 'BOSS RESPAWN TIMER',
  subtitle,
  tzLabel,
  daily,
  fixed,
}: ScheduleImageInput) {
  // ---- layout sizing ----
  const W = 1200;

  // header
  const headerH = 140;

  // daily table
  const dailyRowH = 46;
  const dailyTablePad = 16;
  const dailyTableInnerH = 44 + daily.length * dailyRowH + 12;
  const dailyH = 40 + dailyTableInnerH + 20;

  // fixed cards
  const fixedCardH = 86;
  const fixedCols = 3;
  const fixedGap = 16;
  const fixedSidePad = 24;
  const fixedRows = Math.max(1, Math.ceil(fixed.length / fixedCols));
  const fixedBlockH = 30 + fixedRows * (fixedCardH + fixedGap) - fixedGap + 20;

  const H = 24 + headerH + 16 + dailyH + 8 + fixedBlockH + 24;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ---- background ----
  const topGrad = ctx.createLinearGradient(0, 0, 0, headerH + 60);
  topGrad.addColorStop(0, '#7b5cff');   // indigo
  topGrad.addColorStop(1, '#b96bff');   // purple
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, headerH + 60);

  ctx.fillStyle = '#f6f7fb';
  ctx.fillRect(0, headerH + 60, W, H - (headerH + 60));

  // ---- header card ----
  ctx.shadowColor = 'rgba(73, 48, 140, .25)';
  ctx.shadowBlur = 18;
  roundRect(ctx, 20, 20, W - 40, headerH, 18, true);
  ctx.shadowBlur = 0;

  // header content
  const headerX = 20;
  const headerY = 20;
  const headerW = W - 40;

  // title
  setFont(ctx, 36, 'bold');
  ctx.fillStyle = '#2b2250';
  drawCenter(ctx, title, headerX, headerY, headerW, 56);

  // subtitle + tz
  const subText = [subtitle?.trim(), tzLabel ? `TZ: ${tzLabel}` : '']
    .filter(Boolean)
    .join('  •  ');

  if (subText) {
    setFont(ctx, 16, 'regular');
    ctx.fillStyle = '#6d5fb1';
    drawCenter(ctx, subText, headerX, headerY, headerW, 98);
  }

  // ---- DAILY TABLE ----
  let y = 20 + headerH + 32;
  drawSectionHeader(ctx, 'Daily Bosses (บอสรายวัน)', 28, y);
  y += 18;

  // table frame
  const tX = 28;
  const tW = W - tX * 2;
  const tY = y + 16;
  const tH = dailyTableInnerH + dailyTablePad * 2;

  ctx.shadowColor = 'rgba(0,0,0,.06)';
  ctx.shadowBlur = 10;
  roundRect(ctx, tX, tY, tW, tH, 14, true);
  ctx.shadowBlur = 0;

  // header row bg
  ctx.fillStyle = '#eef0ff';
  roundRect(ctx, tX + dailyTablePad, tY + dailyTablePad, tW - dailyTablePad * 2, 40, 10, true);

  // column layout
  const col = {
    name: tX + dailyTablePad + 18,
    respawn: tX + 220,
    last: tX + 470,
    next: tX + 770,
  };

  // table headers
  setFont(ctx, 15, 'bold');
  ctx.fillStyle = '#2b2d42';
  ctx.fillText('ชื่อบอส', col.name, tY + dailyTablePad + 27);
  ctx.fillText('รอบเกิด', col.respawn, tY + dailyTablePad + 27);
  ctx.fillText('เวลาตายล่าสุด', col.last, tY + dailyTablePad + 27);
  ctx.fillText('เกิดรอบถัดไป', col.next, tY + dailyTablePad + 27);

  // rows
  let rY = tY + dailyTablePad + 40;
  for (let i = 0; i < daily.length; i++) {
    const d = daily[i];

    // zebra row
    if (i % 2 === 0) {
      ctx.fillStyle = '#fafbff';
      roundRect(ctx, tX + dailyTablePad, rY + 6, tW - dailyTablePad * 2, dailyRowH - 12, 8, true);
    }

    // name
    setFont(ctx, 16, 'bold');
    ctx.fillStyle = '#1e1f2c';
    ctx.fillText(d.name, col.name, rY + 28);

    // respawn badge
    drawBadge(ctx, `${d.respawnHours} ชม.`, col.respawn, rY + 10);

    // last
    setFont(ctx, 16);
    ctx.fillStyle = '#4c4f69';
    ctx.fillText(d.lastDeath ?? '—', col.last, rY + 28);

    // next
    setFont(ctx, 16, 'bold');
    ctx.fillStyle = '#0b7d5b';
    ctx.fillText(d.nextSpawn ?? '—', col.next, rY + 28);

    rY += dailyRowH;
  }

  y = tY + tH + 26;

  // ---- FIXED CARDS ----
  drawSectionHeader(ctx, 'Fixed-time Bosses (บอสรายเวลา)', 28, y);
  y += 10;

  const gridX = 28 + fixedSidePad;
  const gridW = W - 2 * (28 + fixedSidePad);
  const cardW = Math.floor((gridW - (fixedGap * (fixedCols - 1))) / fixedCols);

  let cx = gridX;
  let cy = y + 26;

  fixed.forEach((f, i) => {
    // card
    ctx.shadowColor = 'rgba(0,0,0,.05)';
    ctx.shadowBlur = 8;
    roundRect(ctx, cx, cy, cardW, fixedCardH, 12, true);
    ctx.shadowBlur = 0;

    // name
    setFont(ctx, 18, 'bold');
    ctx.fillStyle = '#1c2130';
    ctx.fillText(f.name, cx + 16, cy + 30);

    // next spawn
    setFont(ctx, 15);
    ctx.fillStyle = '#0b7d5b';
    ctx.fillText(f.nextSpawn ? `รอบถัดไป: ${f.nextSpawn}` : 'รอบถัดไป: —', cx + 16, cy + 54);

    // slots
    const slots = f.slots?.length ? f.slots.join('  •  ') : '—';
    setFont(ctx, 14);
    ctx.fillStyle = '#61647a';
    drawEllipsisText(ctx, slots, cx + 16, cy + 74, cardW - 32);

    // advance grid
    const colIdx = (i % fixedCols);
    if (colIdx === fixedCols - 1) {
      cx = gridX;
      cy += fixedCardH + fixedGap;
    } else {
      cx += cardW + fixedGap;
    }
  });

  // ---- export ----
  return new AttachmentBuilder(Buffer.from(canvas.toBuffer('image/png')), {
    name: 'schedule.png',
  });
}

/* =========================
   Helpers
========================= */
function setFont(ctx: import('@napi-rs/canvas').SKRSContext2D, px: number, weight: 'regular'|'bold'='regular') {
  const fam = weight === 'bold' ? 'PromptBold' : 'Prompt';
  ctx.font = `${weight === 'bold' ? 'bold ' : ''}${px}px ${fam}, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawCenter(ctx: SKRSContext2D, text: string, x: number, y: number, w: number, centerY: number) {
  const metrics = ctx.measureText(text);
  const tx = x + (w - metrics.width) / 2;
  ctx.fillText(text, tx, centerY);
}

function drawSectionHeader(ctx: SKRSContext2D, label: string, x: number, y: number) {
  // pill
  const padH = 20;
  const padV = 8;
  setFont(ctx, 14, 'bold');
  const w = ctx.measureText(label).width + padH * 2;
  ctx.fillStyle = '#f1eaff';
  roundRect(ctx, x, y, w, 28, 14, true);

  // text
  ctx.fillStyle = '#5b40d1';
  ctx.fillText(label, x + padH, y + 20);
}

function drawBadge(ctx: SKRSContext2D, text: string, x: number, y: number) {
  setFont(ctx, 14, 'bold');
  const padX = 10;
  const h = 24;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = '#efeaff';
  roundRect(ctx, x, y, w, h, 12, true);
  ctx.fillStyle = '#5b40d1';
  ctx.fillText(text, x + padX, y + 17);
}

function drawEllipsisText(ctx: SKRSContext2D, text: string, x: number, y: number, maxW: number) {
  // single-line ellipsis
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, x, y);
    return;
  }
  let shown = text;
  while (shown.length > 0 && ctx.measureText(shown + '…').width > maxW) {
    shown = shown.slice(0, -1);
  }
  ctx.fillText(shown + '…', x, y);
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