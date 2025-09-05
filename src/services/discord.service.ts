// src/services/discord.service.ts
import { TextChannel } from 'discord.js';
import { client } from '../lib/client.js';
import { ENV } from '../lib/env.js';
import { renderTablesSplit } from './table.service.js';

/**
 * อัปเดตข้อความตารางในช่องตาม ENV.DISCORD_SCHEDULE_CHANNEL_ID
 * - โพสต์ 2 ข้อความ: Daily และ Fixed (แบ่งโพสต์)
 * - ถ้ามี MESSAGE_ID แยก (DAILY/FIXED) จะพยายามแก้ไขโพสต์เดิม
 * - ถ้ายาวเกินลิมิต 2000 จะตัดแบ่งอัตโนมัติและส่งหลายข้อความแทน (พร้อมปิด code block ให้ถูก)
 */
export async function updateScheduleMessage(gameCode = 'L9'): Promise<void> {
  const channelId = ENV.DISCORD_SCHEDULE_CHANNEL_ID;
  if (!channelId) throw new Error('Missing ENV DISCORD_SCHEDULE_CHANNEL_ID');

  const channel = (await client.channels.fetch(channelId)) as TextChannel;
  if (!channel || channel.isDMBased()) {
    throw new Error('Schedule channel is invalid or DM-based.');
  }

  const { daily, fixed } = await renderTablesSplit(gameCode);

  // ถ้ามี message id แยก ให้ลองแก้ไขก่อน
  const dailyId = (ENV as any).DISCORD_SCHEDULE_MESSAGE_ID_DAILY ?? ENV.DISCORD_SCHEDULE_MESSAGE_ID;
  const fixedId = (ENV as any).DISCORD_SCHEDULE_MESSAGE_ID_FIXED;

  // ส่ง/แก้ไขแต่ละส่วน
  await upsertLongMessage(channel, daily, dailyId, true);  //Daily
  await upsertLongMessage(channel, fixed, fixedId, false); //Fixed
}

/** พยายาม edit; ถ้าไม่มี/ผิดพลาด จะส่งใหม่ (รองรับแยกข้อความอัตโนมัติถ้ายาวเกิน 2000) */
async function upsertLongMessage(
  channel: TextChannel,
  content: string,
  messageId?: string,
  replaceExisting = true
): Promise<void> {
  const chunks = splitToDiscordMessages(content);
  if (messageId && replaceExisting && chunks.length === 1) {
    // ลองแก้ไขโพสต์เดิม (ทำได้เฉพาะกรณีเป็นชิ้นเดียวและยาวไม่เกินลิมิต)
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(chunks[0]);
      return;
    } catch {
      // ตกลงไปส่งใหม่ด้านล่าง
    }
  }

  // ถ้ามี id เดิมและเราจะ “แทนที่” ให้ลองลบก่อน เพื่อไม่ให้ค้างหลายชุด
  if (messageId && replaceExisting) {
    try {
      const msg = await channel.messages.fetch(messageId);
      await msg.delete().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  // ส่งใหม่ทั้งหมดเป็นหลายชิ้นถ้าจำเป็น
  for (const part of chunks) {
    await channel.send({ content: part });
  }
}

/** แบ่งข้อความให้ไม่เกิน 2000 ตัว (ปิด/เปิด code block ให้สมบูรณ์อัตโนมัติ) */
function splitToDiscordMessages(text: string): string[] {
  const LIMIT = 2000;

  // กรณีทั่วไปพยายามคง block ``` ให้ถูก
  const parts: string[] = [];

  // แยกเป็นบล็อกตามเครื่องหมาย ``` เพื่อทำความสะอาดโค้ดบล็อก
  // ถ้าไม่อยากซับซ้อน: ตัดตามบรรทัดให้พอดีลิมิต แล้ว “พยายาม” ห่อด้วย ``` ใหม่ทุกชิ้นที่เริ่ม/จบในบล็อก
  const lines = text.split('\n');

  let buf: string[] = [];
  let inCode = false;

  const pushBuf = () => {
    if (!buf.length) return;
    let payload = buf.join('\n');
    // ถ้ายาวเกิน LIMIT ให้ตัดย่อยอีกชั้น (ปกติไม่น่าเกินเพราะเรา buffer ตามบรรทัด)
    if (payload.length > LIMIT) {
      const hardChunks = hardSplit(payload, LIMIT);
      parts.push(...hardChunks);
    } else {
      parts.push(payload);
    }
    buf = [];
  };

  for (const line of lines) {
    const isFence = line.trim().startsWith('```');
    if (isFence) {
      // ถ้าจะปิดบล็อก และบัฟเฟอร์จะทะลุลิมิต ให้ปิดบัฟเก่าให้เรียบร้อยก่อน
      if (inCode) {
        // ปิดบล็อกลงในบัฟ
        buf.push('```');
        pushBuf();
        inCode = false;
        continue;
      }
      // จะเริ่มบล็อกใหม่
      // ถ้า buf มีข้อความธรรมดาค้างอยู่ ให้ดันก่อน
      pushBuf();
      buf.push('```');
      inCode = true;
      continue;
    }

    const next = (buf.join('\n') + (buf.length ? '\n' : '') + line);
    if (next.length > LIMIT - (inCode ? 3 : 0)) {
      // ถ้าเพิ่มแล้วจะทะลุ และตอนนี้อยู่ใน code block ให้ปิดก่อน แล้วเริ่มบล็อกใหม่
      if (inCode) {
        buf.push('```');
        pushBuf();
        buf.push('```'); // เปิดบล็อกใหม่สำหรับบรรทัดถัดไป
      } else {
        pushBuf();
      }
    }
    buf.push(line);
  }

  // ปิดท้าย
  if (inCode) buf.push('```');
  pushBuf();

  // ทำความสะอาดชิ้นที่เกินจริง ๆ (เผื่อผิดพลาด) ด้วย hardSplit
  return parts.flatMap(p => (p.length > LIMIT ? hardSplit(p, LIMIT) : [p]));
}

/** ตัดแบบ hard ไม่สนใจบรรทัด */
function hardSplit(s: string, limit: number): string[] {
  const arr: string[] = [];
  for (let i = 0; i < s.length; i += limit) {
    arr.push(s.slice(i, i + limit));
  }
  return arr;
}