import { client } from './lib/client.js';
import { ENV } from './lib/env.js';
import { data as bossData, execute as bossExecute } from './commands/boss.js';
import { data as fixData, execute as fixExecute } from './commands/fix.js';

client.on('ready', () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === bossData.name) return bossExecute(i);
    if (i.commandName === fixData.name) return fixExecute(i);
  } catch (e) {
    console.error(e);
    if (i.isRepliable())
      i.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }).catch(() => {});
  }
});

client.login(ENV.DISCORD_TOKEN);