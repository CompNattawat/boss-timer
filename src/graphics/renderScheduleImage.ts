// src/graphics/renderScheduleImage.ts
import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';

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

// ตัวอย่างการลงฟอนต์ไทย (ถ้ามีไฟล์ฟอนต์ในโปรเจ็กต์)
// GlobalFonts.register('/app/fonts/Prompt-Regular.ttf', 'Prompt');

export function renderScheduleImage({
  title = 'BOSS RESPAWN TIMER',
  subtitle,
  tzLabel,
  daily,
  fixed,
}: ScheduleImageInput) {
  const W = 1100;
  const headerH = 120;
  const rowH = 44;
  const dailyH = 60 + daily.length * rowH + 20;
  const fixedRowH = 70;
  const fixedCols = 3;
  const fixedRows = Math.ceil(fixed.length / fixedCols);
  const fixedH = 60 + Math.max(1, fixedRows) * fixedRowH + 20;
  const H = headerH + dailyH + fixedH + 40;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // BG
  const grad = ctx.createLinearGradient(0, 0, 0, headerH + 80);
  grad.addColorStop(0, '#8a2be2');
  grad.addColorStop(1, '#ff7ec8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH + 80);

  ctx.fillStyle = '#f7f7fb';
  ctx.fillRect(0, headerH + 80, W, H - (headerH + 80));

  // Header card
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 12;
  roundRect(ctx, 20, 20, W - 40, headerH, 14, true, false);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#3b2a63';
  ctx.font = 'bold 36px sans-serif';
  centerText(ctx, title, W / 2, 65);

  ctx.fillStyle = '#6b5ca3';
  ctx.font = '16px sans-serif';
  let sub = subtitle ?? '';
  if (tzLabel) sub = sub ? `${sub}  •  TZ: ${tzLabel}` : `TZ: ${tzLabel}`;
  if (sub) centerText(ctx, sub, W / 2, 95);

  // Daily table
  let y = headerH + 110;
  drawSectionTitle(ctx, 'Daily Bosses (บอสรายวัน)', 30, y);
  y += 28;

  const tableX = 30;
  const tableW = W - 60;
  const colXs = [tableX + 0, tableX + 150, tableX + 470, tableX + 770];
  const headers = ['ชื่อบอส', 'รอบเกิด', 'เวลาตายล่าสุด', 'เกิดรอบถัดไป'];

  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 8;
  roundRect(ctx, tableX, y, tableW, 60 + daily.length * rowH + 10, 10, true, false);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#f0f3ff';
  roundRect(ctx, tableX + 10, y + 10, tableW - 20, 40, 8, true, false);

  ctx.fillStyle = '#2b2d42';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(headers[0], colXs[0] + 20, y + 36);
  ctx.fillText(headers[1], colXs[1] + 20, y + 36);
  ctx.fillText(headers[2], colXs[2] + 20, y + 36);
  ctx.fillText(headers[3], colXs[3] + 20, y + 36);

  ctx.font = '16px sans-serif';
  let ry = y + 60;
  daily.forEach((d, idx) => {
    if (idx % 2 === 0) {
      ctx.fillStyle = '#fafbff';
      roundRect(ctx, tableX + 10, ry + 4, tableW - 20, rowH - 8, 6, true, false);
    }
    ctx.fillStyle = '#232323';
    ctx.fillText(d.name, colXs[0] + 20, ry + 28);

    ctx.fillStyle = '#6949ff';
    drawBadge(ctx, `${d.respawnHours} ชม.`, colXs[1] + 18, ry + 10);

    ctx.fillStyle = '#434343';
    ctx.fillText(d.lastDeath ?? '-', colXs[2] + 20, ry + 28);

    ctx.fillStyle = '#0b7d5b';
    ctx.fillText(d.nextSpawn ?? '-', colXs[3] + 20, ry + 28);

    ry += rowH;
  });

  y = y + 60 + daily.length * rowH + 30;

  // Fixed cards
  drawSectionTitle(ctx, 'บอสรายเวลา (Fixed)', 30, y);
  y += 20;

  const cardPad = 16;
  const cardW = Math.floor((W - 60 - cardPad * 2) / 3);
  let fx = 30, fy = y + 16;

  fixed.forEach((f, i) => {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 6;
    roundRect(ctx, fx, fy, cardW, fixedRowH, 10, true, false);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#1d2030';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(f.name, fx + 16, fy + 28);

    ctx.fillStyle = '#0b7d5b';
    ctx.font = '16px sans-serif';
    ctx.fillText(f.nextSpawn ? `รอบหน้า: ${f.nextSpawn}` : 'รอบหน้า: -', fx + 16, fy + 50);

    const slots = f.slots.length ? f.slots.join('  •  ') : '-';
    ctx.fillStyle = '#6c6c80';
    ctx.font = '14px sans-serif';
    ctx.fillText(slots, fx + 16, fy + 66);

    const col = i % 3;
    if (col === 2) {
      fx = 30;
      fy += fixedRowH + 14;
    } else {
      fx += cardW + cardPad;
    }
  });

  return new AttachmentBuilder(Buffer.from(canvas.toBuffer('image/png')), {
    name: 'schedule.png',
  });
}

/* ---------- helpers (type ถูกต้องเป็น SKRSContext2D) ---------- */

function roundRect(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number, r: number,
  fill = false, stroke = true
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

function centerText(ctx: SKRSContext2D, txt: string, cx: number, y: number) {
  const w = ctx.measureText(txt).width;
  ctx.fillText(txt, cx - w / 2, y);
}

function drawBadge(ctx: SKRSContext2D, text: string, x: number, y: number) {
  const padX = 10;
  const h = 24;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = '#efeaff';
  roundRect(ctx, x, y, w, h, 12, true, false);
  ctx.fillStyle = '#5b40d1';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(text, x + padX, y + 17);
}

function drawSectionTitle(ctx: SKRSContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = '#23233a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(text, x, y);
}