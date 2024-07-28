const connectToTwitch = require('../twitch/auth.js');
const {loadCommands} = require("../commandLoader");

const client = connectToTwitch();
loadCommands(client);

module.exports = { client };