// src/commands/schedule.ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import dayjs from 'dayjs';
import { safeDefer, safeReply } from '../lib/interaction.js';

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Show current boss schedule');

export async function execute(i: ChatInputCommandInteraction) {
  try {
    await safeDefer(i, false);

    // ทำงานจริง (DB, format ข้อความ)
    const bosses = await prisma.boss.findMany({ orderBy: { name: 'asc' } });
    const lines = bosses.map(b => {
      const next = b.nextSpawnAt ? dayjs(b.nextSpawnAt).format('HH:mm') : '—';
      return `• ${b.name} — next: ${next}`;
    });

    const content = lines.length ? lines.join('\n') : 'ยังไม่มีข้อมูลบอส';
    await safeReply(i, { content });
  } catch (err) {
    console.error('schedule error:', err);
    if (!i.replied) {
      // fallback เผื่อ defer ไม่ทัน
      await safeReply(i, { content: 'เกิดข้อผิดพลาด (schedule)', ephemeral: true }).catch(() => {});
    }
  }
}