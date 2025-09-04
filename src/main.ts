import { client } from './lib/client.js';
import { ENV } from './lib/env.js';
import { Events } from 'discord.js';
import { data as bossData, execute as bossExecute } from './commands/boss.js';
import { data as fixData, execute as fixExecute } from './commands/fix.js';
import { data as scheduleData, execute as scheduleExecute } from './commands/schedule.js';

client.on('ready', () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
});

client.once(Events.ClientReady, async (c) => {
  const guild = await c.guilds.fetch(ENV.DISCORD_GUILD_ID);
  await guild.commands.set([bossData, fixData, scheduleData].map(d => d.toJSON()));
  console.log(`Registered slash commands to ${guild.name}`);
});

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  try {
    if (i.commandName === bossData.name) return bossExecute(i);
    if (i.commandName === fixData.name) return fixExecute(i);
    if (i.commandName === scheduleData.name) return scheduleExecute(i);
  } catch (e) {
    console.error(e);
    if (i.isRepliable()) i.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }).catch(() => {});
  }
});

client.login(ENV.DISCORD_TOKEN);