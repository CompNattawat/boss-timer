import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildScheduleEmbeds } from '../views/schedule.js';

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('แสดงเวลาบอสทั้งหมด และเวลาที่จะเกิด');

export async function execute(i: ChatInputCommandInteraction) {
  await i.deferReply();
  const embeds = await buildScheduleEmbeds();
  await i.editReply({ embeds });
}