// scripts/deploy-commands.ts
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const appId = process.env.DISCORD_APP_ID!;
const token = process.env.DISCORD_TOKEN!;

const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
  {
    name: 'schedule',
    description: 'Show current schedule',
  },
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(token);

  console.log('⏳ Registering GLOBAL slash commands...');
  await rest.put(
    Routes.applicationCommands(appId), // ✅ ใช้ appId ไม่ใช่ clientId
    { body: commands },
  );
  console.log('✅ Global slash commands registered');
}

main().catch(console.error);