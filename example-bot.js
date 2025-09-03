const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on('ready', () => {
  console.log(`Bot Logged in as ${client.user.tag}`);
});

client.on('messageCreate', msg => {
  if (msg.content === "!ping") {
    msg.reply("pong!");
  }
});

client.login(process.env.BOT_TOKEN);
