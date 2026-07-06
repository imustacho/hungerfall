import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { getCommandData } from '../src/commands/index.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID as string;
const guildId = process.env.GUILD_ID as string;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);
const commands = getCommandData();

async function deploy() {
  try {
    console.log(`📋 Deploying ${commands.length} command(s)...`);

    if (guildId) {
      // Guild-scoped (instant, for development)
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      );
      console.log(`✅ Commands deployed to guild ${guildId}`);
    } else {
      // Global (takes up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      console.log('✅ Commands deployed globally (may take up to 1 hour)');
    }
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
    process.exit(1);
  }
}

deploy();
