// utils-time.ts (หรือไฟล์ที่ใช้ร่วม)
import dayjs from 'dayjs';
import tz from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc); dayjs.extend(tz);

const TZ = 'Asia/Bangkok';

export function toDayjsSafe(v: unknown) {
  if (!v) return null;
  if (v instanceof Date) return dayjs(v);
  if (typeof v === 'string' || typeof v === 'number') {
    const d = dayjs(v);
    return d.isValid() ? d : null;
  }
  return null;
}

export function fmtDMYHM(v: unknown): string {
  const d = toDayjsSafe(v);
  return d ? d.tz(TZ).format('DD/MM/YYYY HH:mm') : '—';
}