const {removeLevel, searchQueue} = require("../../utils/queue");
const logConsole = require("../../logger");

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