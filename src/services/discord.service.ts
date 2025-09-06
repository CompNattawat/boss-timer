// src/services/discord.service.ts
import { AttachmentBuilder, GuildTextBasedChannel } from 'discord.js';
import { client } from '../lib/client.js';
import { prisma } from '../lib/prisma.js';
import { renderTablesSplit } from './table.service.js';

export async function postScheduleMessageForGuild(
  guildId: string,
  gameCode: string
): Promise<void> {
  if (!client.isReady()) {
    await new Promise<void>((res) => client.once('ready', () => res()));
  }

  // 1) ดึง guild config จาก DB
  const g = await prisma.guild.findUnique({
    where: { platform_externalId: { platform: 'discord', externalId: guildId } },
  });
  if (!g?.scheduleChannelId) {
    throw new Error(`Guild ${guildId} ไม่มี scheduleChannelId`);
  }

  // 2) fetch channel
  const raw = await client.channels.fetch(g.scheduleChannelId);
  if (!raw || !raw.isTextBased() || raw.isDMBased()) {
    throw new Error(`Channel ${g.scheduleChannelId} ไม่ใช่ text channel`);
  }
  const channel = raw as GuildTextBasedChannel;

  // 3) render ตาราง
  const { daily, fixed } = await renderTablesSplit(gameCode);

  // 4) ส่งข้อความใหม่ทุกครั้ง
  await sendMessageWithFallback(channel, daily, `daily_${gameCode}`);
  await sendMessageWithFallback(channel, fixed, `fixed_${gameCode}`);
}

/**
 * ส่งข้อความ ถ้ายาวเกิน 2000 → ส่งเป็นไฟล์ .txt แทน
 */
async function sendMessageWithFallback(
  channel: GuildTextBasedChannel,
  content: string,
  filenameHint?: string
) {
  const MAX = 2000;
  if (content.length > MAX) {
    const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
      name: `${filenameHint || 'schedule'}.txt`,
    });
    await channel.send({
      content: 'ตารางยาวเกิน 2000 ตัวอักษร — แนบเป็นไฟล์แทน',
      files: [file],
    });
  } else {
    await channel.send({ content });
  }
}