const limits = require('../../limits.json');
const {hasReachedRequestLimit, addLevelToQueue} = require("../../utils/queue");

module.exports = {
    name: '!r',
    category: 'queue',
    description: 'Add an item to queue',
    params: true,
    execute(client, channel, tags, username, message) {
        const levelId = extractLevelId(message);
        if (levelId) {
            const isSubscriber = tags.subscriber || tags.mod || tags.broadcaster;
            if (hasReachedRequestLimit(username, isSubscriber)) {
                client.say(channel, `Sorry, you have reached your request limit of ${isSubscriber ? limits.subscriberRequestLimit : limits.viewerRequestLimit} level(s).`);
            } else {
                addLevelToQueue(levelId, isSubscriber, username, client);
            }
        } else {
            client.say(channel, 'Invalid level ID. Please provide a level ID between 3 and 9 characters.');
        }
    }
};

// Extract the level ID from the command message
/**
 * Extracts the level ID from a given message.
 *
 * @param {string} message - The message containing the level ID.
 * @return {number|null} - The extracted level ID, or null if it doesn't meet the criteria.
 */
function extractLevelId(message) {
    const levelId = message;
    const isNumeric = /^\d+$/.test(levelId); // Check if levelId is numeric

    if (levelId && levelId.length >= 3 && levelId.length <= 9 && isNumeric) {
        return parseInt(levelId, 10);
    }

    return null;
}