const { goToNextLevel } = require("../../utils/queue");

module.exports = {
    name: '!next',
    category: 'queue',
    description: 'Go to the next item in queue',
    params: false,
    tags: ['moderator', 'broadcaster'],
    execute(client, channel, tags, username, message, parameters) {
        const next = goToNextLevel();

        if (next.message) {
            client.say(channel, next.message);
        } else {
            client.say(channel, `Next ${next.queueType} Level: ${next.levelId} (Submitted by: ${next.username}). Run !info ${next.levelId} for more information!`);
        }
    }
};