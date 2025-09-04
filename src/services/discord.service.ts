import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import { client } from '../lib/client.js';
import { ENV } from '../lib/env.js';
import { GuildTextBasedChannel } from 'discord.js';

/** เรนเดอร์ตารางของเกมเดียว */
async function renderTable(gameCode: string): Promise<string> {
  const game = await prisma.game.findUnique({ where: { code: gameCode } });
  if (!game) return `ยังไม่มีเกมรหัส **${gameCode}**`;

  const bosses = await prisma.boss.findMany({
    where: { gameId: game.id },
    orderBy: [{ name: 'asc' }],
  });
  if (!bosses.length) return `เกม **${gameCode}** ยังไม่มีบอส (ลอง /boss add)`;

  const header =
    'NAME                 RH  LAST-DEATH     NEXT-SPAWN\n' +
    '------------------   --  -------------  ----------------';

  const rows = bosses.map(b => {
    const rh = String(b.respawnHours ?? '-').padStart(2);
    const last = b.lastDeathAt ? dayjs(b.lastDeathAt).format('DD/MM HH:mm') : '-'
    const next = b.nextSpawnAt ? dayjs(b.nextSpawnAt).format('YYYY-MM-DD HH:mm') : '-'
    return `${b.name.padEnd(18)}   ${rh}  ${last.padEnd(13)}  ${next}`;
  });

  return '```\n' + header + '\n' + rows.join('\n') + '\n```';
}

/** อัปเดตข้อความตารางในช่องจาก ENV (ถ้ามี MESSAGE_ID จะ edit, ไม่มีจะส่งใหม่) */
export async function updateScheduleMessage(gameCode: string): Promise<void> {
  const channelId = ENV.DISCORD_SCHEDULE_CHANNEL_ID;
  if (!channelId) {
    console.error('ENV.DISCORD_SCHEDULE_CHANNEL_ID is missing');
    return;
  }

  const raw = await client.channels.fetch(channelId).catch(() => null);
  const ch = raw as GuildTextBasedChannel;
  if (!ch || !ch.isTextBased()) {
    console.error('Schedule channel not found or not text-based:', channelId);
    return;
  }

  const content = await renderTable(gameCode);
  const messageId = ENV.DISCORD_SCHEDULE_MESSAGE_ID;

  try {
    if (messageId) {
      const msg = await ch.messages.fetch(messageId);
      await msg.edit({ content });
    } else {
      const sent = await ch.send({ content });
      // ✅ copy ค่า sent.id ไปตั้งเป็น ENV: DISCORD_SCHEDULE_MESSAGE_ID เพื่อให้รอบต่อไป edit ได้
      console.log('Created schedule message. Save DISCORD_SCHEDULE_MESSAGE_ID =', sent.id);
    }
  } catch (err) {
    // ถ้า fetch ข้อความเดิมไม่ได้ ให้ส่งใหม่
    const sent = await ch.send({ content });
    console.log('Recreated schedule message. Save DISCORD_SCHEDULE_MESSAGE_ID =', sent.id);
  }
}