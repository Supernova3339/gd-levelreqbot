const { clearQueue } = require("../../utils/queue");

module.exports = {
    name: '!clear',
    category: 'queue',
    description: 'Clear all the existing items',
    params: false,
    tags: ['mod', 'broadcaster'],
    execute(client, channel, parameters) {
        const result = clearQueue();
        client.say(channel, result);
    }
};