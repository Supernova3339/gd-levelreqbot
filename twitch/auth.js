const tmi = require('tmi.js');
const botConfig = require('../auth-config.json');
const pkg = require('../package.json');
const logConsole = require("../logger");
const figlet = require("figlet");
const {countCommands} = require("../commandLoader");
const limits = require("../limits.json");
const {channel} = require("tmi.js/lib/utils");
const {client} = require("../modules/clientModule");

const connectToTwitch = () => {
    const twitchConfig = {
        identity: {
            username: botConfig.botUsername,
            password: botConfig.botToken
        },
        channels: [botConfig.channel]
    };

    const client = new tmi.Client(twitchConfig);

    client.on('connecting', () => logConsole('Connecting to Twitch...'));
    client.on('connected', (address, port) => logConsole(`Connected to Twitch on ${address}:${port}`));
    client.on('connected', () => console.log(figlet.textSync(pkg.name.toUpperCase(), { font: "Whimsy" })));
    client.on('connected', () => logConsole(countCommands() + ' Commands have successfully been loaded ✓'));
    // client.on('connected', () => performAction(client));
    client.on('disconnected', (reason) => logConsole(`Disconnected from Twitch. Reason: ${reason}`));

    client.connect().catch(console.error);

    return client;
}

async function performAction(client) {
    try {
        const result = await client.say(botConfig.channel, `GD-LevelReqBot Cloud is currently in development mode while connected to this channel.`);
        console.log('Message result:', result);
    } catch (error) {
        console.error('Error occurred:', error);
    }
}

module.exports = connectToTwitch;