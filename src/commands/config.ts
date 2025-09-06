// src/commands/config.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    GuildTextBasedChannel,
  } from 'discord.js';
  import { prisma } from '../lib/prisma.js';
  import { safeDefer, safeReply, safeFollowUp } from '../lib/interaction.js';
import { ensureGuild } from '../services/guild.service.js';
  
  export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('ตั้งค่าบอทสำหรับกิลด์นี้')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sc =>
    sc.setName('channel')
      .setDescription('ตั้งค่าช่องสำหรับตารางบอส')
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('เลือก Text Channel สำหรับโพสต์ตาราง')
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
          )
          .setRequired(false) // ✅ อนุญาตไม่ใส่ → จะ fallback เป็นห้องที่สั่ง
      )
  )
  .addSubcommand(sc =>
    sc.setName('message')
      .setDescription('ผูก Message ID ของโพสต์ตารางที่มีอยู่แล้ว')
      .addStringOption(o =>
        o.setName('message_id').setDescription('Message ID').setRequired(true)
      )
  );

  export async function execute(i: ChatInputCommandInteraction) {
    // ต้องอยู่ในกิลด์เท่านั้น
    if (!i.inGuild() || !i.guildId) {
      return i.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น', ephemeral: true });
    }
  
    // เช็คสิทธิ์แอดมินเซิร์ฟเวอร์
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return i.reply({ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์', ephemeral: true });
    }
  
    const sub = i.options.getSubcommand();
    await safeDefer(i, true); // defer แบบ ephemeral
  
    if (sub === 'channel') {
      if (!i.inGuild() || !i.guildId) {
        return safeReply(i, { content: 'ต้องใช้ในเซิร์ฟเวอร์เท่านั้น', flags: 64 }); // ephemeral
      }
  
      // รองรับทั้งกรณีเลือก channel มา และไม่เลือก (fallback = ห้องปัจจุบัน)
   // รองรับทั้งกรณีเลือก channel มา และไม่เลือก (fallback = ห้องปัจจุบัน)
    const pickedOpt = i.options.get('channel'); // ไม่บังคับ
    const ch = (pickedOpt?.channel ?? i.channel) as GuildTextBasedChannel | null;

    if (!ch || !ch.isTextBased() || ch.isDMBased()) {
      return safeReply(i, { content: 'กรุณาเลือก **Text Channel** ในกิลด์', flags: 64 });
    }

    const g = await ensureGuild(i.guildId!);

    await prisma.guild.update({
      where: { id: g.id },
      data: { scheduleChannelId: ch.id, scheduleMessageId: null },
    });

    await safeReply(i, { content: `✅ ตั้งค่าช่องตารางเป็น <#${ch.id}> แล้ว`, flags: 64 });
    await safeFollowUp(i, { content: 'ตารางบอสจะอัปเดตอัตโนมัติเมื่อมีการเปลี่ยนแปลง' });
      return;
    }
  
    if (sub === 'game') {
      const code = i.options.get('code', true).value as string;
  
      // สร้าง/หา Game ตาม code
      const game = await prisma.game.upsert({
        where: { code },
        update: {},
        create: { code, name: code },
      });
  
      // ผูกกิลด์กับเกมนี้เป็นดีฟอลต์
      const g = await ensureGuild(game.id!);
      await prisma.guild.update({
        where: { id: g.id },
        data: { gameId: game.id },
      });
  
      return safeReply(i, { content: `✅ ตั้งค่าเกมดีฟอลต์ของกิลด์เป็น **${code}** แล้ว`, ephemeral: true });
    }
  
    return safeReply(i, { content: 'ซับคอมมานด์ไม่ถูกต้อง', ephemeral: true });
  }