const express = require('express');
const {createRoute} = require("../utils/webHelper");
const logConsole = require("../logger");
const {getUserQueuePosition, removeFromQueue, clearEntireQueue, addDataToQueue, nextLevelInQueue, listQueueItems} = require("../utils/web/queue");
const {checkServerForUpdates, listServerCommands} = require("../utils/web/system");

function initializeWebModule() {
    const app = express();
    const PORT = 24363;

    // Middleware to parse JSON requests
    app.use(express.json());

    // Queue Routes
    createRoute(app, 'post', '/api/queue/position', getUserQueuePosition);
    createRoute(app, 'delete', '/api/queue/delete', removeFromQueue);
    createRoute(app, 'post', '/api/queue/clear', clearEntireQueue);
    createRoute(app, 'post', '/api/queue/add', addDataToQueue);
    createRoute(app, 'post', '/api/queue/next', nextLevelInQueue);
    createRoute(app, 'post', '/api/queue/list', listQueueItems);

    // System Routes
    createRoute(app, 'get', '/api/system/checkForUpdates', checkServerForUpdates);
    createRoute(app, 'get', '/api/system/listServerCommands', listServerCommands);

    // Start the server
    app.listen(PORT, () => {
        logConsole(`Server is running on port ${PORT}`);
    });
}

module.exports = {initializeWebModule};