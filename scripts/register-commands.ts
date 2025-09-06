// scripts/deploy-commands.ts
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as bossData } from '../src/commands/boss.js';
import { data as fixData } from '../src/commands/fix.js';

const token = process.env.DISCORD_TOKEN!;
const appId = process.env.DISCORD_APP_ID!;

async function run() {
  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(
    Routes.applicationCommands(appId), // ✅ global ไม่ต้องใช้ guildId
    { body: [bossData.toJSON(), fixData.toJSON()] }
  );

  console.log('✅ Global slash commands registered');
}

run().catch(console.error);