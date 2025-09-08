// src/services/discord.service.ts
import { Guild } from '@prisma/client';
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
  await sendMessageWithFallback(g, channel, daily, `daily_${gameCode}`);
  await sendMessageWithFallback(g, channel, fixed, `fixed_${gameCode}`);
}

/**
 * ส่งข้อความ ถ้ายาวเกิน 2000 → ส่งเป็นไฟล์ .txt แทน
 */
async function sendMessageWithFallback(
  g: Guild,
  channel: GuildTextBasedChannel,
  content: string,
  filenameHint?: string
) {
  const MAX = 2000;
  if (content.length > MAX) {
    const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
      name: `${filenameHint || 'schedule'}.txt`,
    });
    if (g.scheduleMessageId) {
      await channel.messages
        .edit(g.scheduleMessageId, { content: `ตารางบอส (${filenameHint})`, files: [file] })
        .catch(async () => {
          const msg = await channel.send({ content: `ตารางบอส (${filenameHint})`, files: [file] });
          await prisma.guild.update({
            where: { id: g.id },
            data: { scheduleMessageId: msg.id },
          });
        });
    } else {
      const msg = await channel.send({ content: `ตารางบอส (${filenameHint})`, files: [file] });
      await prisma.guild.update({
        where: { id: g.id },
        data: { scheduleMessageId: msg.id },
      });
    }
  } else {
     // แก้ไขข้อความเดิมถ้ามี (ใช้ scheduleMessageId เดิมเพื่อไม่งอกโพสต์)
     if (g.scheduleMessageId) {
      // edit-in-place
      await channel.messages.edit(g.scheduleMessageId, content).catch(async () => {
        const msg = await channel.send(content);
        await prisma.guild.update({
          where: { id: g.id },
          data: { scheduleMessageId: msg.id },
        });
      });
    } else {
      // ส่งใหม่ครั้งแรก
      const msg = await channel.send(content);
      await prisma.guild.update({
        where: { id: g.id },
        data: { scheduleMessageId: msg.id },
      });
    }
  }
}