// src/commands/schedule.ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import dayjs from 'dayjs';

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Show current boss schedule');

export async function execute(i: ChatInputCommandInteraction) {
  try {
    // ACK ให้เร็วที่สุด
    if (!i.deferred && !i.replied) {
      await i.deferReply({ ephemeral: false }); // <= สำคัญ
    }

    // ทำงานจริง (DB, format ข้อความ)
    const bosses = await prisma.boss.findMany({ orderBy: { name: 'asc' } });
    const lines = bosses.map(b => {
      const next = b.nextSpawnAt ? dayjs(b.nextSpawnAt).format('HH:mm') : '—';
      return `• ${b.name} — next: ${next}`;
    });

    const content = lines.length ? lines.join('\n') : 'ยังไม่มีข้อมูลบอส';
    // ตอบกลับครั้งเดียวด้วย editReply
    await i.editReply({ content });
  } catch (err) {
    console.error('schedule error:', err);
    if (!i.replied) {
      // fallback เผื่อ defer ไม่ทัน
      await i.reply({ content: 'เกิดข้อผิดพลาด (schedule)', ephemeral: true }).catch(() => {});
    }
  }
}