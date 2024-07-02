const logConsole = require("../logger");

function handleMessage(client) {
    return (channel, tags, message, self) => {
        // Ignore echoed messages.
        if (self) return;

        // Split the incoming message into command and parameters
        const splitMessage = message.split(/\s+/);
        const commandName = splitMessage[0].trim();
        const parameters = message.substr(commandName.length).trim();

        // console.log('User tags:', tags);

        // If this command exists:
        if (client.commands.has(commandName)) {
            const command = client.commands.get(commandName);

            if(command.tags && command.tags.length > 0) {

                const hasPermission = command.tags.some(tag => tags.badges && tag in tags.badges);

                if (!hasPermission) {
                    return;
                }
            }

            if (command.params && parameters.length > 0) {
                command.execute(client, channel, tags, message, parameters);
            } else if (!command.params) {
                command.execute(client, channel, tags, message);
            }
        } else {
            logConsole(`Command not found: ${commandName}`);
        }
    };
}

module.exports = handleMessage;