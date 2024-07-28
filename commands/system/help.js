// TODO: merge commands
// TODO: add a commandOverrides.json that overrides a commands set name, eg !list becomes !queue

const {fetchCommands} = require("../../commandLoader");
module.exports = {
    name: '!commands',
    category: 'system',
    description: 'Lists all commands',
    async execute(client, channel) {

        const commands = fetchCommands();

        // If there are no commands loaded, return.
        if (!commands.length) {
            client.say(channel, 'No commands available.');
            return;
        }

        let commandsByCategory = {};

        commands.forEach(command => {
            const category = command.category;
            if (!commandsByCategory[category]) {
                commandsByCategory[category] = [];
            }
            commandsByCategory[category].push(command.name);
        });

        let message = 'Available commands:\n';
        for (let category in commandsByCategory) {
            message += `\n${category}:\n`;
            commandsByCategory[category].forEach((command) => {
                message += ` - ${command}\n`;
            });
        }

        // Say the gathered commands in the channel
        client.say(channel, message);
    },
};