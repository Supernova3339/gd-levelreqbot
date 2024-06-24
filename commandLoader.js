// File: commandLoader.js
const fs = require('fs');
const path = require('path');

function loadCommands(client) {
    const baseDirectory = path.resolve(__dirname, './commands');

    client.commands = new Map();

    // This recursive function will read all command files in the commands directory and its subdirectories
    function readCommands(directory) {
        const files = fs.readdirSync(directory);

        for (let file of files) {
            const fullPath = path.resolve(directory, file);
            const stats = fs.statSync(fullPath);

            // If the current file is a directory, read its files (i.e., commands in the subcategory)
            if (stats.isDirectory()) {
                readCommands(fullPath);
            }
            else {
                const command = require(fullPath);
                client.commands.set(command.name, {execute: command.execute, params: command.params || false});

                // if (command.params) {
                //     console.log(`Command '${command.name}' allows params.`);
                // }
            }
        }
    }

    // Start reading commands from the base commands directory
    readCommands(baseDirectory);
}

module.exports = loadCommands;