import { EmbedBuilder, TextChannel } from 'discord.js';
import { ENV } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { client } from '../lib/client.js';

export async function updateScheduleMessage(gameCode = ENV.DEFAULT_GAME_CODE) {
  const channel = await client.channels.fetch(ENV.DISCORD_SCHEDULE_CHANNEL_ID) as TextChannel;
  const game = await prisma.game.findUnique({ where: { code: gameCode }, include: { bosses: true } });

  const rows = (game?.bosses ?? []).map((b: { nextSpawnAt: string | number | Date; name: any; }) => {
    const next = b.nextSpawnAt
      ? new Date(b.nextSpawnAt).toLocaleString('th-TH', { timeZone: ENV.TZ })
      : '—';
    const status = b.nextSpawnAt ? 'รอเกิด' : '—';
    return `**${b.name}** • ${status} • ถัดไป: ${next}`;
  }).join('\n') || 'ยังไม่มีข้อมูล';

  const embed = new EmbedBuilder()
    .setTitle(`BOSS RESPAWN — ${gameCode}`)
    .setDescription(rows)
    .setTimestamp(new Date());

  const msgId = ENV.DISCORD_SCHEDULE_MESSAGE_ID;
  const msg = await channel.messages.fetch(msgId).catch(()=>null);
  if (msg) return msg.edit({ embeds: [embed] });
  const sent = await channel.send({ embeds: [embed] });
  console.log('New schedule message id:', sent.id);
}