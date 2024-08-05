const fs = require('fs');
const path = require('path');
const logConsole = require("./logger");

function loadCommands(client) {
    const baseDirectory = path.resolve(__dirname, './commands');

    client.commands = new Map();

    function readCommands(directory) {
        const files = fs.readdirSync(directory);

        for (let file of files) {
            const fullPath = path.resolve(directory, file);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                readCommands(fullPath);
            } else {
                const command = require(fullPath);
                client.commands.set(command.name, {execute: command.execute, params: command.params, tags: command.tags || false});

                // log the command name and category.
                logConsole(`${command.category}: ${command.name} | ${command.description} loaded`);

                // if (command.params) {
                //     logConsole(`Command '${command.name}' allows params.`);
                // }
            }
        }
    }

    readCommands(baseDirectory);
}

function fetchCommands() {
    const baseDirectory = path.resolve(__dirname, './commands');
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
                // Exclude commands from the 'system' category
                if (command.category !== 'system') {
                    commandsArray.push({
                        name: command.name,
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

