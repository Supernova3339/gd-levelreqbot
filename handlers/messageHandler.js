
function handleMessage(client) {
    return (channel, tags, message, self) => {
        // Ignore echoed messages.
        if (self) return;

        const splitMessage = message.split(/\s+/);
        const commandName = splitMessage[0].trim();
        const parameters = message.substr(commandName.length).trim();

        if (client.commands.has(commandName)) {
            const command = client.commands.get(commandName);

            if(command.tags && command.tags.length > 0) {
                const hasPermission = command.tags.some(tag => {
                    // logConsole(`Checking badge ${tag}: ${hasBadge ? 'Present' : 'Absent'}`);
                    return !!(tags['badges'] && tags['badges'][tag]);
                });

                if (!hasPermission) {
                    return;
                }
            }

            if (command.params && parameters.length > 0) {
                command.execute(client, channel, tags, tags.username, message, parameters);
            } else if (!command.params) {
                command.execute(client, channel, tags, tags.username, message);
                // console.log(tags['badges']);
            }
        }
    };
}

module.exports = handleMessage;