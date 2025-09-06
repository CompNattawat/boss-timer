// src/services/announce.ts
import type { GuildTextBasedChannel } from 'discord.js';
import { client } from '../lib/client.js';
import { prisma } from '../lib/prisma.js';
import { buildScheduleEmbeds } from '../views/schedule.js';
// ถ้าอยากรองรับข้อความยาวแบบตารางตัวอักษร แทน embeds:
// import { renderTablesSplit } from '../services/table.service.js';

/**
 * ประกาศตารางให้ “กิลด์เดียว” ตาม externalId (guildId จาก Discord)
 * - โพสต์ใหม่เสมอ (ไม่แก้ message เดิม, ไม่ใช้ messageId)
 * - gameCode จะดึงจากความสัมพันธ์ของกิลด์กับ Game (ถ้ามี) หรือส่ง override มาก็ได้
 */
export async function announceScheduleForGuild(
  guildExternalId: string,
  opts?: { gameCodeOverride?: string }
): Promise<void> {
  if (!client.isReady()) {
    await new Promise<void>((res) => client.once('ready', () => res()));
  }

  // 1) ดึง config ของกิลด์จาก DB (ใช้ unique composite: platform + externalId)
  const g = await prisma.guild.findUnique({
    where: {
      platform_externalId: { platform: 'discord', externalId: guildExternalId },
    },
    include: {
      game: true, // เอาไว้ดู code
    },
  });

  if (!g || !g.scheduleChannelId) {
    throw new Error('ยังไม่ได้ตั้งค่า scheduleChannelId สำหรับกิลด์นี้');
  }

  // หา gameCode (ลำดับความสำคัญ: opts.override > g.game.code > 'L9')
  const gameCode = opts?.gameCodeOverride ?? g.game?.code ?? 'L9';

  // 2) fetch channel ของกิลด์นั้น
  const raw = await client.channels.fetch(g.scheduleChannelId);
  if (!raw || !raw.isTextBased() || raw.isDMBased()) {
    throw new Error(`Channel ${g.scheduleChannelId} ไม่ใช่ guild text channel`);
  }
  const ch = raw as GuildTextBasedChannel;

  // 3) สร้างเนื้อหาและส่ง “โพสต์ใหม่เสมอ”
  // --- แบบ embeds (อ่านง่าย สวยกว่า) ---
  const embeds = await buildScheduleEmbeds(gameCode);
  await ch.send({ embeds });

  // --- ถ้าอยากใช้ตารางตัวอักษรยาว ๆ (.txt เมื่อเกิน 2000) ให้สลับมาใช้บล็อกนี้แทน ---
  // const { daily, fixed } = await renderTablesSplit(gameCode);
  // await sendMessageOrTextFile(ch, daily, `daily_${gameCode}`);
  // await sendMessageOrTextFile(ch, fixed, `fixed_${gameCode}`);
}

/** ถ้าข้อความยาวเกิน 2000 ตัวอักษร → ส่งเป็นไฟล์ .txt แทน */
async function sendMessageOrTextFile(
  ch: GuildTextBasedChannel,
  content: string,
  filenameHint?: string
) {
  const MAX = 2000;
  if (content.length <= MAX) {
    await ch.send({ content });
    return;
  }
  const { AttachmentBuilder } = await import('discord.js');
  const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
    name: `${filenameHint || 'schedule'}.txt`,
  });
  await ch.send({
    content: 'ตารางยาวเกิน 2000 ตัวอักษร — แนบเป็นไฟล์แทน',
    files: [file],
  });
}