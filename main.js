const {client} = require('./modules/clientModule.js');
const handleMessage = require('./handlers/messageHandler.js');
const checkForUpdates = require('./modules/updateModule.js');
const {saveSubscriberQueue, saveViewerQueue} = require("./utils/queue");
const handleIDMessage = require("./handlers/smartHandler");
const modes = require('./modes.json');

// Check for updates
checkForUpdates(client);

client.on('message', handleMessage(client));
if (modes.smart) { // if user has smart enabled
    client.on('message', handleIDMessage(client));
}

// Save the queues to files when the bot is shut down
process.on('SIGINT', () => {
    saveSubscriberQueue();
    saveViewerQueue();
    process.exit();
});