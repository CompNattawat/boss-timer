// src/main.ts
import { 
  REST,
  Routes,
  Events,
  MessageFlags,
} from 'discord.js';
import { client } from './lib/client.js';
import { ENV } from './lib/env.js';

// ---- รวมคำสั่งทั้งหมดไว้ที่เดียว
import { data as bossData, execute as bossExecute } from './commands/boss.js';
import { data as fixData, execute as fixExecute } from './commands/fix.js';
import { data as scheduleData, execute as scheduleExecute } from './commands/schedule.js';
import { data as bulkBossData, execute as bulkBossExecute } from './commands/bulk-boss.js';
import { data as bulkTimesData, execute as bulkTimesExecute } from './commands/bulk-times.js';
import { data as configData, execute as configExecute } from './commands/config.js';

// ⭐ import registerScheduleImageButtons
import { registerScheduleImageButtons } from './services/discord.service.js';

const CMDS = [bossData, fixData, scheduleData, bulkBossData, bulkTimesData, configData];

// เรียกเพื่อผูกปุ่มไว้กับ client
registerScheduleImageButtons(client);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Ready! Logged in as ${c.user.tag}`);

  // กัน worker มาลงทะเบียนซ้ำ
  if (ENV.SERVICE_ROLE && ENV.SERVICE_ROLE !== 'bot') {
    console.log(`↪️ SERVICE_ROLE=${ENV.SERVICE_ROLE} (skip registering commands)`);
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(ENV.DISCORD_TOKEN);

    // เลือก scope จาก ENV.COMMAND_SCOPE = 'global' | 'guild'
    const scope = (ENV as any).COMMAND_SCOPE === 'guild' ? 'guild' : 'global';

    if (scope === 'guild') {
      if (!ENV.DISCORD_GUILD_ID) {
        console.warn('⚠️ COMMAND_SCOPE=guild แต่ไม่มี DISCORD_GUILD_ID — ข้ามการลงทะเบียน');
      } else {
        await rest.put(
          Routes.applicationGuildCommands(ENV.DISCORD_APP_ID, ENV.DISCORD_GUILD_ID),
          { body: CMDS.map((d) => d.toJSON()) },
        );
        console.log(`🛠️ Registered ${CMDS.length} GUILD commands to ${ENV.DISCORD_GUILD_ID}`);
      }
    } else {
      await rest.put(
        Routes.applicationCommands(ENV.DISCORD_APP_ID),
        { body: CMDS.map((d) => d.toJSON()) },
      );
      console.log(`🌍 Registered ${CMDS.length} GLOBAL commands (อาจใช้เวลา 1–5 นาทีให้ Discord sync)`);
    }
  } catch (err) {
    console.error('❌ Register commands failed:', err);
  }
});

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    switch (i.commandName) {
      case bossData.name:     return bossExecute(i);
      case fixData.name:      return fixExecute(i);
      case scheduleData.name: return scheduleExecute(i);
      case bulkBossData.name: return bulkBossExecute(i);
      case bulkTimesData.name:return bulkTimesExecute(i);
      case configData.name:   return configExecute(i);
      default:
        return i.reply({ content: 'ไม่พบคำสั่งนี้แล้ว ลองใหม่อีกครั้ง', flags: MessageFlags.Ephemeral as number }).catch(() => {});
    }
  } catch (err) {
    console.error('⚠️ interaction error:', err);
    if (!i.replied && !i.deferred) {
      await i.reply({ content: 'เกิดข้อผิดพลาด', flags: MessageFlags.Ephemeral as number }).catch(() => {});
    }
  }
});

// กันโปรเซสเด้ง
client.on('error', (e) => console.error('client error:', e));
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

client.login(ENV.DISCORD_TOKEN);