// src/commands/config.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    GuildTextBasedChannel,
  } from 'discord.js';
  import { prisma } from '../lib/prisma.js';
  import { safeDefer, safeReply } from '../lib/interaction.js';
  
  export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('ตั้งค่าบอทในกิลด์นี้')
  .addSubcommand(sc =>
    sc.setName('channel')
      .setDescription('กำหนดช่องสำหรับโพสต์ตาราง')
      .addChannelOption(o =>
        o.setName('target')
         .setDescription('เลือก text channel')
         .addChannelTypes(ChannelType.GuildText)
         .setRequired(true)
      )
  )
  .addSubcommand(sc => sc
    .setName('game')
    .setDescription('ตั้งค่า default game code')
    .addStringOption(o => o.setName('code').setDescription('โค้ดเกม เช่น L9').setRequired(true))
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
  
    // helper: upsert ระเบียน guild (platform+externalId เป็น unique)
    const ensureGuild = async () => {
      return prisma.guild.upsert({
        where: { platform_externalId: { platform: 'discord', externalId: i.guildId! } },
        update: {},
        create: { platform: 'discord', externalId: i.guildId!, gameId: '', scheduleChannelId: null, scheduleMessageId: null },
      });
    };
  
    if (sub === 'channel') {
      const opt = i.options.get('channel', true);
      const ch = opt.channel as GuildTextBasedChannel | null;
      // ต้องเป็น text-based และไม่ใช่ DM
      if (!ch || !ch.isTextBased() || ch.isDMBased()) {
        return i.reply({ content: 'กรุณาเลือก **Text Channel** ในกิลด์', ephemeral: true });
      }
  
      // บันทึก channel id
      const g = await ensureGuild();
      await prisma.guild.update({
        where: { id: g.id },
        data: { scheduleChannelId: ch.id },
      });
  
      // เคลียร์ messageId เก่า (กันหลง)
      await prisma.guild.update({
        where: { id: g.id },
        data: { scheduleMessageId: null },
      }).catch(() => {});
  
      return safeReply(i, { content: `✅ ตั้งค่าช่องตารางเป็น <#${ch.id}> แล้ว`, ephemeral: true });
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
      const g = await ensureGuild();
      await prisma.guild.update({
        where: { id: g.id },
        data: { gameId: game.id },
      });
  
      return safeReply(i, { content: `✅ ตั้งค่าเกมดีฟอลต์ของกิลด์เป็น **${code}** แล้ว`, ephemeral: true });
    }
  
    return safeReply(i, { content: 'ซับคอมมานด์ไม่ถูกต้อง', ephemeral: true });
  }