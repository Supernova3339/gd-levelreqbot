const { goToNextLevel } = require("../../utils/queue");
const logConsole = require("../../logger");
const {sendAnnouncement} = require("../../utils/twitch");
const botConfig = require('../../auth-config.json');

module.exports = {
    name: '!next',
    category: 'queue',
    description: 'Go to the next item in queue',
    params: false,
    tags: ['moderator', 'broadcaster'],
    async execute(client, channel, tags, username, message, parameters) {
        const next = goToNextLevel();

        if (next.message) {
            client.say(channel, next.message);
        } else {
            await sendAnnouncement(
                `Next ${next.queueType} Level: ${next.levelId} (Submitted by: ${next.username}). Run !info ${next.levelId} for more information!`,
                botConfig.TwitchAccessUserID, // broadcaster ID
                {color: "orange"}
            );
            // client.say(channel, `Next ${next.queueType} Level: ${next.levelId} (Submitted by: ${next.username}). Run !info ${next.levelId} for more information!`);
        }
    }
};