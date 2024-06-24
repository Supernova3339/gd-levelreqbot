const limits = require('../../limits.json');
const {hasReachedRequestLimit, addLevelToQueue} = require("../../utils/queue");
const logConsole = require("../../logger");

module.exports = {
    name: '!r',
    category: 'queue',
    description: 'Add an item to queue',
    params: true,
    execute(client, channel, tags, username, message, parameters) {
        const levelId = extractLevelId(parameters);
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

function extractLevelId(message) {
    const levelId = message;
    const isNumeric = /^\d+$/.test(levelId); // Check if levelId is numeric

    if (levelId && levelId.length >= 3 && levelId.length <= 9 && isNumeric) {
        return parseInt(levelId, 10);
    }

    return null;
}