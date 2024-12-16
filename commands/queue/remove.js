const {removeLevel, searchQueue} = require("../../utils/queue");
const {extractLevelId} = require("../../utils/web/queue");

module.exports = {
    name: '!remove',
    category: 'queue',
    description: 'Remove an existing item',
    params: true,
    tags: [],
    execute(client, channel, tags, username, message) {

        // Get the keys of the badges object as an array
        let badgeList = Object.keys(tags['badges']);

        // Check if the user has any badges
        if (badgeList.length === 0) {
            badgeList = [];
        }

        if (badgeList.includes('broadcaster') || badgeList.includes('moderator')) {
            // Handle remove level command if the tags include 'broadcaster' or 'moderator'
            const levelId = extractLevelId(message);
            const result = removeLevel(levelId);
            client.say(channel, result);
        } else {
            // Perform a different action if the tags do not include 'broadcaster' or 'moderator'
            const levelId = extractLevelId(message);
            const isLevelFromUser = searchQueue(levelId);
            console.log(isLevelFromUser)
            if (isLevelFromUser.username === username) {
                const result = removeLevel(levelId);
                client.say(channel, result);
            }
        }
    }
};