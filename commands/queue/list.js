const {getViewerQueueMessage, getSubscriberQueueMessage} = require("../../utils/queue");
const modes = require('../../modes.json')

module.exports = {
    name: '!list',
    category: 'queue',
    description: 'List all the existing items',
    tags: [],
    execute(client, channel) {
        // Display the current state of the viewer queue
        let queueMessage = getViewerQueueMessage();

        // If the subscriber queue is enabled, also display the state of the subscriber queue
        if (modes.sub) {
            const subscriberQueueMessage = getSubscriberQueueMessage();
            queueMessage += `\n${subscriberQueueMessage}`;
        }

        client.say(channel, queueMessage);
    }
};