// src/services/discord.service.ts
// ✨ เพิ่ม import ให้ครอบคลุม type send()
import {
  MessageFlags,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  GuildTextBasedChannel,
  Client,
  TextBasedChannel, // ✅
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
// ✅ ใช้ sendWithLimit ทั้งทุกกรณี + ไม่แตะ scheduleMessageId เดิม
export async function postScheduleMessageForGuild(
  guildId: string,
  gameCode: string
): Promise<void> {
  if (!client.isReady()) {
    await new Promise<void>((res) => client.once('ready', () => res()));
  }

  const g = await prisma.guild.findUnique({
    where: { platform_externalId: { platform: 'discord', externalId: guildId } },
  });
  if (!g?.scheduleChannelId) throw new Error(`Guild ${guildId} ไม่มี scheduleChannelId`);

  const raw = await client.channels.fetch(g.scheduleChannelId);
  if (!raw || !raw.isTextBased() || raw.isDMBased()) {
    throw new Error(`Channel ${g?.scheduleChannelId} ไม่ใช่ text channel`);
  }
  const channel = raw as GuildTextBasedChannel;

  // สร้างข้อความตาราง
  const { daily, fixed } = await renderTablesSplit(gameCode);
  const dailyMsg = daily.trim();
  const fixedMsg = fixed.trim();

  // เลือกโหมด (ENV > guild > default=combine)
  const mode = resolvePostMode(g as any); // ยังไม่ใช้

  const combined = [dailyMsg, fixedMsg].filter(Boolean).join('\n\n');
  if (combined) await sendWithLimit(channel, combined, `schedule_${gameCode}`);

  // ปุ่มสร้างรูป
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`genimg:${g.id}:${gameCode}`).setLabel('สร้างรูปภาพตาราง').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`skipimg:${g.id}:${gameCode}`).setLabel('ไม่ต้อง').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ content: 'ต้องการสร้างรูปภาพตารางสรุปด้วยไหม?', components: [row] });
}

/** เรียกใน startup เพื่อให้ปุ่มทำงาน */
// startup
export function registerScheduleImageButtons(c: Client) {
  c.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const [kind, guildId, gameCode] = i.customId.split(':');
    if (kind !== 'genimg' && kind !== 'skipimg') return;

    try {
      if (kind === 'skipimg') {
        // ถ้า interaction ยังไม่ถูก acknowledge
        if (!i.deferred && !i.replied) {
          await i.reply({ content: 'โอเค ไม่สร้างรูป', flags: MessageFlags.Ephemeral as number });
        } else {
          await i.followUp({ content: 'โอเค ไม่สร้างรูป', flags: MessageFlags.Ephemeral as number });
        }
        return;
      }

      // ✅ genimg
      if (!i.deferred && !i.replied) {
        await i.deferReply({ flags: MessageFlags.Ephemeral as number });
      }

      const input = await buildScheduleImageInput(gameCode);
      const file  = renderScheduleImage(input); // AttachmentBuilder

      if (i.deferred) {
        await i.editReply({ files: [file], content: '✅ สร้างรูปภาพแล้ว' });
      } else if (i.replied) {
        await i.followUp({ files: [file], flags: MessageFlags.Ephemeral as number });
      } else {
        await i.reply({ files: [file], flags: MessageFlags.Ephemeral as number });
      }
    } catch (e) {
      // ถ้า defer แล้ว ควรใช้ editReply; ถ้ายัง ให้ reply/followUp
      const msg = '❌ สร้างรูปภาพไม่สำเร็จ';
      if (i.deferred) await i.editReply({ content: msg }).catch(() => {});
      else if (!i.replied) await i.reply({ content: msg, flags: MessageFlags.Ephemeral as number }).catch(() => {});
      else await i.followUp({ content: msg, flags: MessageFlags.Ephemeral as number }).catch(() => {});
      console.error('generate schedule image failed:', e);
    }
  });
}

// ✅ รองรับทุก TextBasedChannel + ตัดข้อความเป็นไฟล์ถ้าเกิน 2000
// ✅ รองรับทุก channel ที่เป็นข้อความในกิลด์แน่ ๆ และมี .send()
async function sendWithLimit(
  channel: GuildTextBasedChannel,
  content: string,
  filenameHint: string
) {
  if (content.length <= 2000) {
    return channel.send({ content });
  }

  const buf = Buffer.from(content, 'utf8');
  return channel.send({
    content: `📄 ตาราง (${filenameHint}) ยาวเกิน 2000 ตัวอักษร ส่งเป็นไฟล์แทน`,
    files: [{ attachment: buf, name: `${filenameHint}.txt` }],
  });
}

// ✅ ปรับให้เลือก mode จาก ENV / guild / ค่าเริ่มต้น
function resolvePostMode(
  g: { schedulePostMode?: string | null } | null
): 'combine' | 'split' {
  const envMode = (process.env.SCHEDULE_POST_MODE || '').toLowerCase();
  const guildMode = (g?.schedulePostMode || '').toLowerCase();
  const m = (guildMode || envMode) as 'combine' | 'split';
  return m === 'split' ? 'split' : 'combine';
}