const express = require('express');
const {createRoute} = require("../utils/webHelper");
const logConsole = require("../logger");
const {getUserQueuePosition, removeFromQueue, clearEntireQueue, addDataToQueue, nextLevelInQueue, listQueueItems} = require("../utils/web/queue");
const {checkServerForUpdates, listServerCommands, sendClientVersion, healthcheck} = require("../utils/web/system");
const {searchGJProfile, searchGJLevel} = require("../utils/web/gd");

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
    createRoute(app, 'get', '/api/system/getClientVersion', sendClientVersion);

    // Healthcheck
    createRoute(app, 'get', '/healthcheck', healthcheck);

    // Geometry Dash
    createRoute(app, 'post', '/api/gj/search/profile', searchGJProfile);
    createRoute(app, 'post', '/api/gj/search/level', searchGJLevel);

    // Start the server
    app.listen(PORT, () => {
        logConsole(`Server is running on port ${PORT}`);
    });
}

module.exports = {initializeWebModule};