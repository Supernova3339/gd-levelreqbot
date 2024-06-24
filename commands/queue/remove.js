const { removeLevel } = require("../../utils/queue");

module.exports = {
    name: '!remove',
    category: 'queue',
    description: 'Remove an existing item',
    params: true,
    tags: ['mod', 'broadcaster'],
    execute(client, channel, parameters) {
        // Handle remove level command
        const result = removeLevel(parameters);
        client.say(channel, result);
    }
};