// src/commands/config.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    GuildTextBasedChannel,
  } from 'discord.js';
  import { prisma } from '../lib/prisma.js';
  
  export const data = new SlashCommandBuilder()
    .setName('config')
    .setDescription('ตั้งค่าบอทสำหรับกิลด์นี้')
    .addSubcommand(sc =>
      sc
        .setName('channel')
        .setDescription('ตั้งแชนแนลสำหรับโพสต์ตาราง/แจ้งเตือน')
        .addChannelOption(o =>
          o
            .setName('channel')
            .setDescription('เลือก Text Channel')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement
            )
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  
  export async function execute(i: ChatInputCommandInteraction) {
    if (!i.guild) {
      return i.reply({ content: 'ใช้ในเซิร์ฟเวอร์เท่านั้น', ephemeral: true });
    }
  
    const sub = i.options.getSubcommand();
    if (sub === 'channel') {
      // ✅ ไม่เรียก getChannel(); ใช้ get() แล้วอ่าน .channel
      const opt = i.options.get('channel', true);
      const ch = opt.channel as GuildTextBasedChannel | null;
  
      if (!ch || !ch.isTextBased() || ch.isDMBased()) {
        return i.reply({ content: 'กรุณาเลือก **Text Channel** ในกิลด์', ephemeral: true });
      }
  
      // บันทึกลงตาราง Guild (ปรับ gameId ให้เข้าระบบคุณ)
      await prisma.guild.upsert({
        where: { platform_externalId: { platform: 'discord', externalId: i.guild.id } },
        update: { scheduleChannelId: ch.id },
        create: {
          platform: 'discord',
          externalId: i.guild.id,
          scheduleChannelId: ch.id,
          gameId: /* ใส่ gameId ที่ต้องการ map ให้กิลด์นี้ */ '',
        },
      });
  
      return i.reply({ content: `บันทึกแชนแนลเรียบร้อย: <#${ch.id}>`, ephemeral: true });
    }
  }