const createError = require('http-errors');
const {createRoute} = require("../../webHelper");

// Function to get human-readable error messages
function getAuthErrorMessage(error) {
    const errorMessages = {
        'invalid_request': 'The authentication request was malformed or missing required parameters.',
        'invalid_scope': 'The requested scope is invalid or not supported.',
        'access_denied': 'You denied access to your Twitch account.',
        'unauthorized_client': 'The application is not authorized to use this authentication method.',
        'unsupported_response_type': 'The authorization server does not support obtaining an authorization code using this method.',
        'server_error': 'The authorization server encountered an unexpected error.',
        'temporarily_unavailable': 'The authorization server is temporarily unavailable.',
        'invalid_client': 'Client authentication failed.',
        'invalid_grant': 'The authorization grant or refresh token is invalid or expired.',
    };

    return errorMessages[error] || 'An unknown error occurred during authentication.';
}

// Handler function for authentication failures
function handleAuthFailure(req, res) {
    // Get error details from query parameters
    const error = req.query.error || 'unknown';
    const errorDescription = req.query.error_description;
    const state = req.query.state;

    // Log the error for debugging
    console.error('Twitch Authentication Failed:', {
        error,
        errorDescription,
        state,
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    // Prepare error details for the response
    const errorDetails = {
        status: 'error, ' + req.query.error,
        error: error,
        servMessage: req.query.error,
        message: getAuthErrorMessage(error),
        technicalDetails: errorDescription,
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).substring(7),
        retryUrl: '/auth/twitch'
    };

    // Send JSON response
    res.status(401).json(errorDetails);
}

// Function to set up the failure routes
function setupFailureRoutes(router) {
    // Main failure route
    createRoute(router, 'get', '/twitch/failure', handleAuthFailure, true);

    // Generic login failed route that redirects to the main failure route
    createRoute(router, 'get', '/login-failed', (req, res) => {
        res.redirect('/twitch/failure' + (req.query.error ? `?error=${req.query.error}` : ''));
    }, true);
}

module.exports = {
    setupFailureRoutes
};