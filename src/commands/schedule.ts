// src/commands/schedule.ts
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import { safeDefer, safeReply } from '../lib/interaction.js';
import { renderTablesSplit } from '../services/table.service.js';
import { buildScheduleImageInput } from '../services/schedule-image-data.js';
import { renderScheduleImage } from '../graphics/renderScheduleImage.js';
import { ENV } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Show current boss schedule')
  .addStringOption(o =>
    o.setName('game').setDescription('รหัสเกม (ค่าเริ่มต้นจาก ENV.DEFAULT_GAME_CODE)'),
  )
  .addStringOption(o =>
    o
      .setName('format')
      .setDescription('แสดงเป็น text หรือ image')
      .addChoices(
        { name: 'image (สวย ๆ)', value: 'image' },
        { name: 'text (โค้ดบล็อก)', value: 'text' },
      ),
  );

export async function execute(i: ChatInputCommandInteraction) {
  try {
    // 1) ต้องอยู่ในกิลด์เท่านั้น
    if (!i.inGuild() || !i.guildId) {
      return await safeReply(i, {
        content: 'คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น',
        flags: MessageFlags.Ephemeral as number,
      });
    }

    // 2) อ่าน config กิลด์จาก DB
    const guild = await prisma.guild.findUnique({
      where: { platform_externalId: { platform: 'discord', externalId: i.guildId } },
      select: { scheduleChannelId: true },
    });

    // ถ้ายังไม่ตั้งค่าช่อง
    if (!guild?.scheduleChannelId) {
      return await safeReply(i, {
        content: 'ยังไม่ได้ตั้งค่าช่องตาราง — ใช้คำสั่ง `/config channel channel:#ช่องตาราง` ก่อน',
        flags: MessageFlags.Ephemeral as number,
      });
    }

    // 3) ถ้าใช้คำสั่ง “ไม่ใช่” ช่องตาราง -> error
    if (i.channelId !== guild.scheduleChannelId) {
      return await safeReply(i, {
        content: `คำสั่งนี้ใช้ได้เฉพาะในช่องตาราง <#${guild.scheduleChannelId}> เท่านั้น`,
        flags: MessageFlags.Ephemeral as number,
      });
    }

    // 4) ผ่าน validation แล้ว ค่อย defer
    await safeDefer(i, false);

    const gameCode =
      (i.options.get('game')?.value as string | undefined) ?? ENV.DEFAULT_GAME_CODE!;
    const format =
      (i.options.get('format')?.value as string | undefined) ?? 'image';

    if (format === 'text') {
      const { daily, fixed } = await renderTablesSplit(gameCode);
      const content = `${daily}\n\n${fixed}`;

      if (content.length <= 2000) {
        return await safeReply(i, { content });
      }

      const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
        name: `schedule_${gameCode}.txt`,
      });

      return await safeReply(i, {
        content: 'ตารางยาวเกิน 2000 ตัวอักษร — แนบไฟล์แทน',
        files: [file],
      });
    }

    // format === 'image'
    const input = await buildScheduleImageInput(gameCode);
    const image = renderScheduleImage(input); // AttachmentBuilder
    return await safeReply(i, { content: `ตารางบอส (${gameCode})`, files: [image] });
  } catch (err) {
    console.error('schedule error:', err);
    await safeReply(i, { content: 'เกิดข้อผิดพลาด (schedule)' }).catch(() => {});
  }
}