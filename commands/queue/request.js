const limits = require('../../limits.json');
const {hasReachedRequestLimit, addLevelToQueue} = require("../../utils/queue");
const {extractLevelId} = require("../../utils/web/queue");

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
                const result = addLevelToQueue(levelId, isSubscriber, tags.username, client);
                client.say(channel, result)
            }
        } else {
            client.say(channel, 'Invalid level ID. Please provide a level ID between 3 and 9 characters.');
        }
    }
};