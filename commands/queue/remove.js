const { removeLevel } = require("../../utils/queue");

module.exports = {
    name: '!remove',
    category: 'queue',
    description: 'Remove an existing item',
    params: true,
    tags: ['moderator', 'broadcaster'],
    execute(client, channel, tags, username, message) {
        // Handle remove level command
        const result = removeLevel(message);
        client.say(channel, result);
    }
};