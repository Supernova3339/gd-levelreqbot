const { client } = require('./modules/clientModule.js');
const handleMessage = require('./handlers/messageHandler.js');
const checkForUpdates = require('./modules/updateModule.js');
const {saveSubscriberQueue, saveViewerQueue} = require("./utils/queue");

// Check for updates
checkForUpdates(client);

client.on('message', handleMessage(client));

// Save the queues to files when the bot is shut down
process.on('SIGINT', () => {
    saveSubscriberQueue();
    saveViewerQueue();
    process.exit();
});