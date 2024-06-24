// File path: /updateModule.js
const pkg = require('../package.json');
const botConfig = require('../auth-config.json');
const axios = require('axios');
const logConsole = require("../logger");

async function checkForUpdates(client) {
    // URL of update server
    const url = 'https://dl.supers0ft.us/gdlvlreqbot/';

    // Get the remote version
    const response = await axios.get(url);
    const remoteVersion = response.data;

    // Local version
    const localVersion = pkg.version;

    // Compare versions
    if (localVersion !== remoteVersion.trim()) {
        logConsole(`New version ${remoteVersion} is available. Please update to continue using the bot.`);
        client.say(botConfig.channel, 'New version available. Please update to continue using the bot.')
        process.exit(0);
    } else {
        // user has the latest version, do nothing
    }
}

module.exports = checkForUpdates;