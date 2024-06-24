const {hasReachedRequestLimit, addLevelToQueue, getViewerQueueMessage, getSubscriberQueueMessage} = require("../../utils/queue");

module.exports = {
    name: '!list',
    category: 'queue',
    description: 'List all the existing items',
    execute(client, channel) {
        // Display the current state of the queues
        const viewerQueueMessage = getViewerQueueMessage();
        const subscriberQueueMessage = getSubscriberQueueMessage();
        const queueMessage = `${viewerQueueMessage}\n${subscriberQueueMessage}`;
        client.say(channel, queueMessage);
    }
};