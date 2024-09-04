const {hasReachedRequestLimit, addLevelToQueue} = require("../utils/queue");
const limits = require("../limits.json");

function handleIDMessage(client) {
    return (channel, tags, message, self, username) => {
        // Ignore echoed messages.
        if (self) return;

        // Regular expression to match any numeric ID in the message
        const idPattern = /\b\d+\b/;
        const match = message.match(idPattern);

        if (match) {
            const levelId = extractLevelId(match[0]);
            if (levelId) {
                const isSubscriber = tags.subscriber || tags.mod || tags.broadcaster;
                if (hasReachedRequestLimit(username, isSubscriber)) {
                    client.say(channel, `Sorry, you have reached your request limit of ${isSubscriber ? limits.subscriberRequestLimit : limits.viewerRequestLimit} level(s).`);
                } else {
                    const noFeedbackMessage = true; // Set noFeedbackMessage to true
                    addLevelToQueue(levelId, isSubscriber, tags.username, client, noFeedbackMessage);
                }
            } else {
                client.say(channel, 'Invalid level ID. Please provide a level ID between 3 and 9 characters.');
            }
        }
    };
}

// util functions

// Extract the level ID from the command message
/**
 * Extracts the level ID from a given message.
 *
 * @param {string} message - The message containing the level ID.
 * @return {number|null} - The extracted level ID, or null if it doesn't meet the criteria.
 */
function extractLevelId(message) {
    const levelId = message.match(/\d+/); // Match the first group of digits

    if (levelId && levelId[0].length >= 3 && levelId[0].length <= 9) {
        return parseInt(levelId[0], 10);
    }

    return null;
}

module.exports = handleIDMessage;