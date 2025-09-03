import { Client, GatewayIntentBits, Events } from 'discord.js';

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// เดิม: client.once('ready', () => { ... })
client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});