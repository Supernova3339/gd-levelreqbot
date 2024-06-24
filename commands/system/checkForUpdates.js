const { goToNextLevel } = require("../../utils/queue");
const checkForUpdates = require("../../modules/updateModule");

module.exports = {
    name: '!checkforupdates',
    category: 'system',
    description: 'Check if the bot has an update',
    params: false,
    tags: ['mod', 'broadcaster'],
    execute(client, channel, parameters) {
        checkForUpdates(client);
    }
};