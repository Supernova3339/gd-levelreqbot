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
function createRoute(app, method, path, handler, excludeAuth = false, forceVerify = false) {
    if (excludeAuth) {
        app[method](path, handler);
    } else {
        const middleware = [checkBearerToken];

        // If forceVerify is true, add additional query parameter to the authentication request
        if (forceVerify) {
            middleware.push((req, res, next) => {
                req.query.force_verify = true;
                next();
            });
        }

        app[method](path, middleware, handler);
    }
}

module.exports = { createRoute };
