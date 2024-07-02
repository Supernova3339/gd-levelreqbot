const { goToNextLevel } = require("../../utils/queue");

module.exports = {
    name: '!next',
    category: 'queue',
    description: 'Go to the next item in queue',
    params: false,
    tags: ['moderator', 'broadcaster'],
    execute(client, channel, tags, username, message, parameters) {
        const next = goToNextLevel();
        client.say(channel, next);
    }
};