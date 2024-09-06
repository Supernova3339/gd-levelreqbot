const checkForUpdates = require("../../modules/updateModule");
const {fetchCommands} = require("../../commandLoader");

async function checkServerForUpdates(req, res){
    try {
        const result = await checkForUpdates();
        res.status(200).send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send({error: error});
    }
}

async function listServerCommands(req, res) {
    try {
        const showSystemCommands = true;
        const commands = fetchCommands(showSystemCommands);

        // If there are no commands loaded, return a message
        if (!commands.length) {
            return res.status(200).json({ message: 'No commands available.' });
        }

        let commandsByCategory = {};

        // Organize commands by category
        commands.forEach(command => {
            const category = command.category || 'Uncategorized';
            if (!commandsByCategory[category]) {
                commandsByCategory[category] = [];
            }
            // Push an object containing both name and description
            commandsByCategory[category].push({
                name: command.name,
                description: command.description
            });
        });

        // Format the response
        const response = {};
        for (let category in commandsByCategory) {
            response[category] = commandsByCategory[category];
        }

        // Send the organized commands as JSON response
        res.status(200).json(response);
    } catch (error) {
        // Log the error and return a 500 status
        console.error("Error listing commands:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = { checkServerForUpdates, listServerCommands }