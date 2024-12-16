const {getQueuePosition} = require("../../utils/queue");
const modes = require("../../modes.json");
const {getGJLevels21, getGJUsers20} = require("../../utils/gd");
const {extractLevelId} = require("../../utils/web/queue");

module.exports = {
    name: '!position',
    category: 'queue',
    description: 'Get position of a level in the queue',
    tags: [],
    params: false,
    async execute(client, channel, tags, username, message, parameters) {
        const levelId = extractLevelId(message);
        const result = getQueuePosition(levelId);

        // console.log("level id: " + levelId);
        // console.log("message: " + message)

        if (typeof result === 'string') {
            client.say(channel, result);
        } else {
            if (modes.gd === false) {
                client.say(channel, `Level: ${levelId}, User: ${username}, is at position #${result.position} in the ${result.queue} queue.`);
            } else if (modes.gd === true) {
                const levelData = await getGJLevels21(`${levelId}`, 1, 0);
                const levelName = levelData[0].levelName;
                const levelAuthorPlayerID = levelData[0].playerID;

                const userData = await getGJUsers20(levelAuthorPlayerID);
                const userName = userData[0].userName;

                client.say(channel, `${levelName} is position #${result.position} in the ${result.queue} queue!`);
            }
        }
    },
};