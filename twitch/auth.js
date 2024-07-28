const tmi = require('tmi.js');
const botConfig = require('../auth-config.json');
const pkg = require('../package.json');
const logConsole = require("../logger");
const figlet = require("figlet");
const {countCommands} = require("../commandLoader");

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
    client.on('disconnected', (reason) => logConsole(`Disconnected from Twitch. Reason: ${reason}`));

    client.connect().catch(console.error);

    return client;
}

module.exports = connectToTwitch;