const fs = require('fs');
const path = require('path');
const logConsole = require("./logger");

function loadCommandOverrides() {
    const overridePath = path.resolve(__dirname, './commandOverrides.json');
    logConsole(`Loading command overrides from: ${overridePath}`);

    try {
        if (fs.existsSync(overridePath)) {
            const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
            logConsole(`Raw overrides loaded: ${JSON.stringify(overrides, null, 2)}`);

            // Normalize the overrides to handle the !prefix
            const normalizedOverrides = {};
            for (const [key, value] of Object.entries(overrides)) {
                const normalizedKey = key.replace(/^!/, '');
                normalizedOverrides[normalizedKey] = value;
                logConsole(`Normalized override: ${key} -> ${normalizedKey} = ${value}`);
            }

            return normalizedOverrides;
        }
        logConsole('No commandOverrides.json file found');
        return {};
    } catch (error) {
        logConsole(`Error loading command overrides: ${error.message}`, 'error');
        return {};
    }
}

function loadCommands(client) {
    const baseDirectory = path.resolve(__dirname, './commands');
    logConsole(`Loading commands from base directory: ${baseDirectory}`);

    const commandOverrides = loadCommandOverrides();
    logConsole(`Loaded command overrides: ${JSON.stringify(commandOverrides, null, 2)}`);

    client.commands = new Map();
    client.commandAliases = new Map();

    function readCommands(directory) {
        logConsole(`Reading commands from directory: ${directory}`);
        const files = fs.readdirSync(directory);

        for (let file of files) {
            const fullPath = path.resolve(directory, file);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                logConsole(`Found subdirectory: ${file}`);
                readCommands(fullPath);
            } else {
                logConsole(`Processing command file: ${file}`);
                const command = require(fullPath);

                // Get the command name without the ! prefix
                const originalName = command.name.replace(/^!/, '');
                logConsole(`Original command name: ${originalName}`);

                // Check if there's an override for this command
                const overriddenName = commandOverrides[originalName]
                    ? `!${commandOverrides[originalName]}`
                    : command.name;

                logConsole(`Command name ${command.name} -> ${overriddenName}`);

                // Create the command object with the potentially overridden name
                const commandObject = {
                    name: overriddenName, // Add this line to store the overridden name
                    execute: command.execute,
                    params: command.params,
                    tags: command.tags || false,
                    originalName: command.name,
                    category: command.category,
                    description: command.description
                };

                client.commands.set(overriddenName, commandObject);
                client.commandAliases.set(originalName, overriddenName);

                if (originalName !== overriddenName.replace(/^!/, '')) {
                    logConsole(`${command.category}: ${command.name} (overridden to ${overriddenName}) | ${command.description} loaded`);
                } else {
                    logConsole(`${command.category}: ${command.name} | ${command.description} loaded`);
                }
            }
        }
    }

    readCommands(baseDirectory);
    logConsole(`Finished loading commands. Total commands: ${client.commands.size}`);
    logConsole(`Command mappings: ${JSON.stringify(Object.fromEntries(client.commandAliases), null, 2)}`);
}

function fetchCommands(showSystemCommands) {
    const baseDirectory = path.resolve(__dirname, './commands');
    const commandOverrides = loadCommandOverrides();
    let commandsArray = [];

    function readCommands(directory) {
        const files = fs.readdirSync(directory);

        for (let file of files) {
            const fullPath = path.resolve(directory, file);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                readCommands(fullPath);
            } else {
                const command = require(fullPath);
                const originalName = command.name.replace(/^!/, '');
                const overriddenName = commandOverrides[originalName]
                    ? `!${commandOverrides[originalName]}`
                    : command.name;

                if (showSystemCommands || command.category !== 'system') {
                    commandsArray.push({
                        name: overriddenName,
                        originalName: command.name,
                        description: command.description,
                        execute: command.execute,
                        category: command.category,
                        params: command.params || false
                    });
                }
            }
        }
    }

    readCommands(baseDirectory);
    return commandsArray;
}

function countCommands() {
    const baseDirectory = path.resolve(__dirname, './commands');
    let commandCount = 0;

    function count(directory) {
        const files = fs.readdirSync(directory);

        for (let file of files) {
            const fullPath = path.resolve(directory, file);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                count(fullPath);
            } else {
                const command = require(fullPath);
                if (command.category !== '') {
                    commandCount++;
                }
            }
        }
    }

    count(baseDirectory);
    return commandCount;
}

module.exports = {loadCommands, fetchCommands, countCommands};