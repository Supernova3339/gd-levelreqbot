const { getViewerQueueMessage, getSubscriberQueueMessage } = require("../../utils/queue");
const modes = require('../../modes.json');

module.exports = {
    name: '!list',
    category: 'queue',
    description: 'List all the existing items',
    tags: [],
    params: false,

    async execute(client, channel, tags, username, message, parameters) {
        // Extract page number and optionally items per page from the command message
        const { pageNumber, itemsPerPage } = extractPageAndItems(message);

        // Get the viewer queue message as JSON
        const viewerQueue = getViewerQueueMessage(pageNumber, itemsPerPage);
        client.say(channel, formatQueueMessage(viewerQueue));

        // If subscriber mode is enabled, get and send the subscriber queue message
        if (modes.sub) {
            const subscriberQueue = getSubscriberQueueMessage(pageNumber, itemsPerPage);
            client.say(channel, formatQueueMessage(subscriberQueue));
        }
    },
};

/**
 * Extracts the page number and itemsPerPage from a given command message.
 *
 * @param {string} message - The command message containing the page number and optional itemsPerPage.
 * @return {object} - The extracted pageNumber and itemsPerPage, or defaults if not supplied.
 */
function extractPageAndItems(message) {
    const splitMessage = message.split(' ');

    const pageNumber = splitMessage[1] && /^\d+$/.test(splitMessage[1])
        ? parseInt(splitMessage[1], 10)
        : 1;

    const itemsPerPage = splitMessage[2] && /^\d+$/.test(splitMessage[2])
        ? parseInt(splitMessage[2], 10)
        : 5;

    return { pageNumber, itemsPerPage };
}

/**
 * Formats the queue message for client.say output.
 *
 * @param {object} queueData - The queue data returned by the queue functions.
 * @return {string} - The formatted queue message string.
 */
function formatQueueMessage(queueData) {
    if (!queueData.data.length) {
        return queueData.message;
    }

    const queueItems = queueData.data.map(item => `#${item.position}: Level ${item.levelId} (Submitted by: ${item.username})`).join(' | ');

    return `${queueData.message}: ${queueItems}`;
}
