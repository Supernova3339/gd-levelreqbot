const {getViewerQueueMessage, getSubscriberQueueMessage} = require("../../utils/queue");
const modes = require('../../modes.json');

module.exports = {
    name: '!list',
    category: 'queue',
    description: 'List all the existing items',
    tags: [],
    params: false,

    async execute(client, channel, tags, username, message, parameters) {
        const pageNumber = extractPageNumber(message);

        const viewerQueueMessage = getViewerQueueMessage(pageNumber);
        client.say(channel, viewerQueueMessage);

        if (modes.sub) {
            const subscriberQueueMessage = getSubscriberQueueMessage(pageNumber);
            client.say(channel, subscriberQueueMessage);
        }
    },
};

/**
 * Extracts the page number from a given command message.
 *
 * @param {string} message - The command message containing the page number.
 * @return {number} - The extracted pageNumber, or 1 if not supplied or doesn't meet the criteria.
 */
function extractPageNumber(message) {
    const splitMessage = message.split(' ');

    if (splitMessage.length < 2) {
        return 1;
    }

    const pageNumber = splitMessage[1];

    if (pageNumber && /^\d+$/.test(pageNumber)) {
        return parseInt(pageNumber, 10);
    }

    return 1;
}