const {searchQueue} = require("../../utils/queue");
const modes = require("../../modes.json");
const logConsole = require("../../logger");
const {getGJLevels21, getGJUsers20, getLevelLength} = require("../../utils/gd");
const axios = require('axios');
const {channel} = require("tmi.js/lib/utils");
const {extractLevelId} = require("../../utils/web/queue");

module.exports = {
    name: '!info',
    category: 'queue',
    description: 'Get info of item from queue',
    tags: [],
    params: true,
    async execute(client, channel, tags, username, message, parameters) {
        const levelId = extractLevelId(message);
        const result = searchQueue(levelId);  // Assuming `parameters` is an array and levelId is the first element.
        console.log("level id: " + levelId);

        if (typeof result === 'string') {
            // If `searchQueue` returned a string (levelId not found), pass it directly to the `client.say()` function.
            client.say(channel, result);
        } else {
            if (modes.gd === false) {
                client.say(channel, `Level: ${result.levelId}, User: ${result.username}, found in queue.`);
            } else if (modes.gd === true) {
                const levelData = await getGJLevels21(`${levelId}`, 1, 0); // Replace 'str', 0, 1 with actual values
                const levelName = levelData[0].levelName; // access the levelName property of the returned object
                const levelLength = getLevelLength(levelData[0].length); // get level length
                const levelAuthorPlayerID = levelData[0].playerID

                const userData = await getGJUsers20(levelAuthorPlayerID);
                const userName = userData[0].userName;

                // console.log(`creator: ${userName}`);
                // console.log(`level name: ${levelName}`);

                // console.log(`Level data: ${JSON.stringify(levelData)}`);

                client.say(channel, `${levelName} | ${userName} | ${result.levelId}, Length: ${levelLength}| Requested by: ${result.username}`);
            }
        }
    },
};