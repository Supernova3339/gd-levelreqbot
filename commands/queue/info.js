const {searchQueue} = require("../../utils/queue");
const modes = require("../../modes.json");
const GD = require('gd.js');

module.exports = {
    name: '!info',
    category: 'queue',
    description: 'Get info of item from queue',
    tags: [],
    params: true,
    async execute(client, channel, tags, username, message, parameters) {
        console.log("message params: " + message)
        const result = searchQueue(parameters);  // Assuming `parameters` is an array and levelId is the first element.
        const gd = new GD();

        if (typeof result === 'string') {
            // If `searchQueue` returned a string (levelId not found), pass it directly to the `client.say()` function.
            client.say(channel, result);
        } else {
            if (modes.gd === false) {
                client.say(channel, `Level: ${result.levelId}, User: ${result.username}, found in queue.`);
            } else if (modes.gd === true) {
                const level = await gd.levels.search({query: parameters});
                const creator = await gd.users.get(level.creator.accountID);
                client.say(channel, `${level.name} | ${creator.username} | ${result.levelId}, Requested by: ${result.username}`);
            }
        }
    },
};