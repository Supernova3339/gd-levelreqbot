function handleMessage(client) {
    return (channel, tags, message, self) => {
        // Ignore echoed messages.
        if (self) return;

        // Split the incoming message into command and parameters
        const splitMessage = message.split(/\s+/);
        const commandName = splitMessage[0].trim();
        const parameters = message.substr(commandName.length).trim();

        // If this command exists:
        if (client.commands.has(commandName)) {
            const command = client.commands.get(commandName);

            // Permission validation: only for commands with specified tags.
            if(command.tags && command.tags.length > 0) {
                // Ensure that tags exist before calling some() on it
                const hasPermission = command.tags.some(tag => tags[tag]);
                if (!hasPermission) {
                    return; // Do nothing if user does not have the necessary permission
                }
            }

            // Check if command requires parameters
            if (command.params && parameters.length > 0) {
                command.execute(client, channel, tags, tags.username, message, parameters);
            } else if (!command.params) {
                command.execute(client, channel, tags, tags.username, message);
            }
        }
    };
}

module.exports = handleMessage;