const botConfig = require('../auth-config.json');

// Middleware to check for bearer token
function checkBearerToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    if (token !== botConfig.WebAPIToken) {
        return res.status(401).send('Unauthorized');
    }

    next();
}

// Helper function to create routes
function createRoute(app, method, path, handler, excludeAuth = false) {
    if (excludeAuth) {
        // If excludeAuth is true, don't apply checkBearerToken middleware
        app[method](path, handler);
    } else {
        // Apply checkBearerToken middleware for all other routes
        app[method](path, checkBearerToken, handler);
    }
}

module.exports = { createRoute };
