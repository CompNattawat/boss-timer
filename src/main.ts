// src/main.ts
import { REST, Routes, Events } from 'discord.js';
import { client } from './lib/client.js';
import { ENV } from './lib/env.js';

// import command ทั้งหมด
import { data as bossData, execute as bossExecute } from './commands/boss.js';
import { data as fixData, execute as fixExecute } from './commands/fix.js';
import { data as scheduleData, execute as scheduleExecute } from './commands/schedule.js';
import { data as bulkBossData, execute as bulkBossExecute } from './commands/bulk-boss.js';
import { data as bulkTimesData, execute as bulkTimesExecute } from './commands/bulk-times.js';
import { data as configData, execute as configExecute } from './commands/config.js';

const commands = [
  bossData,
  fixData,
  scheduleData,
  bulkBossData,
  bulkTimesData,
  configData,
];

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Ready! Logged in as ${c.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(ENV.DISCORD_TOKEN);
    // ลงทะเบียนเป็น global
    await rest.put(
      Routes.applicationCommands(ENV.DISCORD_APP_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log(`🌍 Registered ${commands.length} global commands`);
  } catch (err) {
    console.error('❌ Register commands failed:', err);
  }
});

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    switch (i.commandName) {
      case bossData.name: return bossExecute(i);
      case fixData.name: return fixExecute(i);
      case scheduleData.name: return scheduleExecute(i);
      case bulkBossData.name: return bulkBossExecute(i);
      case bulkTimesData.name: return bulkTimesExecute(i);
      case configData.name: return configExecute(i);
    }
  } catch (err) {
    console.error('⚠️ interaction error:', err);
    if (!i.replied) {
      await i.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }).catch(() => {});
    }
  }
});

// กันโปรเซสเด้ง
client.on('error', (e) => console.error('client error:', e));
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

client.login(ENV.DISCORD_TOKEN);