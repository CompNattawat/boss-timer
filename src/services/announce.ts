import { ChannelType, type GuildTextBasedChannel } from 'discord.js';
import { client } from '../lib/client.js';
import { ENV } from '../lib/env.js';
import { buildScheduleEmbeds } from '../views/schedule.js';

export async function announceSchedule() {
  const raw = await client.channels.fetch(ENV.DISCORD_SCHEDULE_CHANNEL_ID);
  if (!raw) throw new Error('Channel not found');

  // ต้องเป็น text-based และไม่ใช่ DM
  if (!raw.isTextBased() || raw.isDMBased()) {
    throw new Error('Schedule channel must be a guild text-based channel');
  }

  const ch = raw as GuildTextBasedChannel; // <- ชนิดนี้มี .send แน่นอน
  const embeds = await buildScheduleEmbeds();

  // ถ้ามี message เดิมให้แก้ไข ไม่งั้นส่งใหม่
  try {
    if (ENV.DISCORD_SCHEDULE_MESSAGE_ID) {
      const msg = await ch.messages.fetch(ENV.DISCORD_SCHEDULE_MESSAGE_ID);
      await msg.edit({ embeds });
      return;
    }
  } catch {
    // ถ้า fetch/edit ไม่ได้ ค่อยส่งใหม่
  }

  await ch.send({ embeds });
}