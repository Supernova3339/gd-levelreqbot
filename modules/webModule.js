const express = require('express');
const {createRoute} = require("../utils/webHelper");
const logConsole = require("../logger");
const {getUserQueuePosition, removeFromQueue, clearEntireQueue, addDataToQueue, nextLevelInQueue, listQueueItems} = require("../utils/web/queue");
const {checkServerForUpdates, listServerCommands, sendClientVersion, healthcheck} = require("../utils/web/system");
const {searchGJProfile, searchGJLevel} = require("../utils/web/gd");
const {twitchRouter, getTwitchAuthURL, isTokenValid} = require("../utils/web/twitch");
const session = require("express-session");
const botConfig = require('../auth-config.json');
const {join} = require("node:path");
const opener = require("opener");

function initializeWebModule() {
    const app = express();
    const PORT = 24363;

    // Use express-session for session support (required for OAuth with Passport.js)
    app.use(session({
        secret: botConfig.ExpressSession, // Replace with a strong secret key
        resave: false,
        saveUninitialized: false,
        cookie: {secure: false} // Set `secure: true` if using HTTPS
    }));

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

    // Twitch
    app.use(twitchRouter);
    // Route to serve the Twitch success page
    createRoute(twitchRouter, 'get', '/twitch/success', (req, res) => {
        const successPagePath = join(__dirname, '../utils/web/views/twitch-success.html');
        res.sendFile(successPagePath);
    }, true);

    // Start the server
    app.listen(PORT, () => {
        logConsole(`Server is running on port ${PORT}`);
        checkTokenAndOpenUrl();
    });
}

async function checkTokenAndOpenUrl() {
    const isValid = await isTokenValid(botConfig.TwitchAccessToken);

    if (!isValid) {
        const twitchAuthUrl = getTwitchAuthURL();
        opener(twitchAuthUrl);
    }
}

module.exports = {initializeWebModule};