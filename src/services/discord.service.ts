// src/services/discord.service.ts
import {
  MessageFlags,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  GuildTextBasedChannel,
  Client,
} from 'discord.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';

import { client } from '../lib/client.js';
import { prisma } from '../lib/prisma.js';
import { renderTablesSplit } from './table.service.js';
import { renderScheduleImage } from '../graphics/renderScheduleImage.js';
import { buildScheduleImageInput } from './schedule-image-data.js';

dayjs.extend(utc); dayjs.extend(tz);
const DEFAULT_TZ = 'Asia/Bangkok';

/** ส่งตารางแบบ “ข้อความใหม่” แล้วถามว่าจะสร้างรูปไหม */
export async function postScheduleMessageForGuild(
  guildId: string,
  gameCode: string
): Promise<void> {
  if (!client.isReady()) {
    await new Promise<void>((res) => client.once('ready', () => res()));
  }

  // 1) อ่านคอนฟิก guild
  const g = await prisma.guild.findUnique({
    where: { platform_externalId: { platform: 'discord', externalId: guildId } },
  });
  if (!g?.scheduleChannelId) {
    throw new Error(`Guild ${guildId} ไม่มี scheduleChannelId`);
  }

  // 2) หา channel
  const raw = await client.channels.fetch(g.scheduleChannelId);
  if (!raw || !raw.isTextBased() || raw.isDMBased()) {
    throw new Error(`Channel ${g.scheduleChannelId} ไม่ใช่ text channel`);
  }
  const channel = raw as GuildTextBasedChannel;

  // 3) render ตารางข้อความ
  const { daily, fixed } = await renderTablesSplit(gameCode);

  const dailyMsg = daily.trim();
  const fixedMsg = fixed.trim();

   // 4) ส่ง “ข้อความใหม่” 2 ข้อความ (daily + fixed) — ไม่แตะ scheduleMessageId เดิม
  if (dailyMsg && fixedMsg && dailyMsg !== fixedMsg) {
    await channel.send({ content: dailyMsg });
    await channel.send({ content: fixedMsg });
  } else if (dailyMsg) {
    await channel.send({ content: dailyMsg + '\n\n(ไม่มี/ซ้ำกับ Fixed-time)' });
  } else if (fixedMsg) {
    await channel.send({ content: fixedMsg });
  }

  // 5) ถามว่าจะสร้างรูปไหม (ปุ่ม)
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`genimg:${g.id}:${gameCode}`)
      .setLabel('สร้างรูปภาพตาราง')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`skipimg:${g.id}:${gameCode}`)
      .setLabel('ไม่ต้อง')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content: 'ต้องการสร้างรูปภาพตารางสรุปด้วยไหม?',
    components: [row],
  });
}

/** เรียกใน startup เพื่อให้ปุ่มทำงาน */
export function registerScheduleImageButtons(c: Client) {
  c.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const [kind, guildId, gameCode] = i.customId.split(':');
    if (kind !== 'genimg' && kind !== 'skipimg') return;

    try {
      if (kind === 'skipimg') {
        await i.reply({ content: 'โอเค ไม่สร้างรูป', flags: MessageFlags.Ephemeral });
        return;
      }

      // genimg
      await i.deferReply({ flags: MessageFlags.Ephemeral });

      const input = await buildScheduleImageInput(gameCode);
      const file = renderScheduleImage(input); // AttachmentBuilder

      // โพสต์รูปลงช่องเดิมของปุ่ม (channel เดียวกับข้อความถาม)
      await i.followUp({ files: [file] });

      await i.editReply({ content: '✅ สร้างรูปภาพแล้ว', components: [] });
    } catch (e) {
      await i.editReply({ content: '❌ สร้างรูปภาพไม่สำเร็จ' });
      console.error('generate schedule image failed:', e);
    }
  });
}

function formatTime(d: Date) {
  return dayjs(d).tz(DEFAULT_TZ).format('YYYY-MM-DD HH:mm');
}