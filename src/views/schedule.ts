import { EmbedBuilder } from 'discord.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { prisma } from '../lib/prisma.js';
import { ENV } from '../lib/env.js';

dayjs.extend(relativeTime);

export async function buildScheduleEmbeds(gameCode?: string) {
  const game = await prisma.game.findUnique({
    where: { code: gameCode ?? ENV.DEFAULT_GAME_CODE },
  });
  
  if (!game) throw new Error('Game not found');
  
  const bosses = await prisma.boss.findMany({
    where: { gameId: game.id },
    orderBy: { name: 'asc' },
  });

  if (bosses.length === 0) {
    return [
      new EmbedBuilder()
        .setTitle(`Boss Schedule (${ENV.DEFAULT_GAME_CODE})`)
        .setDescription('ยังไม่มีข้อมูลบอส')
        .setFooter({ text: 'เวลา: Asia/Bangkok' }),
    ];
  }

  const lines = bosses.map((b) => {
    const next = b.nextSpawnAt
      ? dayjs(b.nextSpawnAt)
      : (b.lastDeathAt ? dayjs(b.lastDeathAt).add(b.respawnHours, 'hour') : null);

    const nextText = next
      ? `${next.format('DD/MM HH:mm')} (${dayjs().to(next)})`
      : '—';

    const lastText = b.lastDeathAt ? dayjs(b.lastDeathAt).format('DD/MM HH:mm') : '—';

    return `• **${b.name}**\n   ↳ next: ${nextText}\n   ↳ last: ${lastText}`;
  });

  // split เป็นหลาย embed หากยาว
  const chunks: string[] = [];
  let acc = '';
  for (const l of lines) {
    const candidate = acc ? `${acc}\n${l}` : l;
    if (candidate.length > 3800) {
      chunks.push(acc);
      acc = l;
    } else {
      acc = candidate;
    }
  }
  if (acc) chunks.push(acc);

  return chunks.map((desc, i) =>
    new EmbedBuilder()
      .setTitle(`Boss Schedule (${ENV.DEFAULT_GAME_CODE})${chunks.length > 1 ? ` [${i + 1}/${chunks.length}]` : ''}`)
      .setDescription(desc)
      .setFooter({ text: 'เวลา: Asia/Bangkok' })
  );
}