// File path: /modules/clientModule.js
const connectToTwitch = require('../twitch/auth.js');
const loadCommands = require('../commandLoader.js');

const client = connectToTwitch();
loadCommands(client);

module.exports = { client };