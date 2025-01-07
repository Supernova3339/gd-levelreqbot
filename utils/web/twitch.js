const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth').OAuth2Strategy;
const axios = require('axios');
const {createRoute} = require('../webHelper');
const botConfig = require('../../auth-config.json');
const fs = require('fs');
const path = require('path');

// Twitch credentials (these should be in your auth-config.json or env variables)
const TWITCH_CLIENT_ID = botConfig.TwitchClientID;
const TWITCH_SECRET = botConfig.TwitchClientSecret;
const CALLBACK_URL = botConfig.TwitchCallbackURL;

// Initialize Express router for Twitch
const twitchRouter = express.Router();

// Initialize Passport for Twitch authentication
passport.use('twitch', new OAuth2Strategy({
        authorizationURL: 'https://id.twitch.tv/oauth2/authorize',
        tokenURL: 'https://id.twitch.tv/oauth2/token',
        clientID: TWITCH_CLIENT_ID,
        clientSecret: TWITCH_SECRET,
        callbackURL: CALLBACK_URL,
        state: true
    },
    function (accessToken, refreshToken, profile, done) {
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;

        // Save user data to auth-config.json
        saveUserAuthData(accessToken, profile);

        done(null, profile);
    }
));

// Serialize and deserialize user for session management
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (user, done) {
    done(null, user);
});

// Override passport profile to get Twitch user data using axios
OAuth2Strategy.prototype.userProfile = function (accessToken, done) {
    axios.get('https://api.twitch.tv/helix/users', {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
        }
    })
        .then(response => {
            const userProfile = response.data;
            console.log(userProfile);
            done(null, userProfile);
        })
        .catch(error => {
            done(new Error('Failed to fetch user profile: ' + error.message));
        });
};

// Save user's access token and username to the auth-config.json file
function saveUserAuthData(accessToken, profile) {
    const configPath = path.join(__dirname, '../../auth-config.json');
    const updatedConfig = {
        ...botConfig,
        TwitchAccessToken: accessToken,
        TwitchUsername: profile.data[0].login  // Save username
    };

    // Write updated config to file
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
}

// Route to initiate Twitch authentication
createRoute(twitchRouter, 'get', '/auth/twitch', passport.authenticate('twitch', {scope: ['user_read']}), true);

// Route for Twitch authentication callback
createRoute(twitchRouter, 'get', '/auth/twitch/callback', passport.authenticate('twitch', {
    successRedirect: '/twitch/success',
    failureRedirect: '/login-failed'
}), true);

// New route to handle the redirection to /twitch/auth/token?accessToken=<accessToken>
createRoute(twitchRouter, 'get', '/twitch/auth/token', async (req, res) => {
    try {
        const { accessToken } = req.query;

        // If the accessToken is missing, respond with an error
        if (!accessToken) {
            return res.status(400).send('Access token is missing');
        }

        // Call the Twitch API to get the user profile (as done in userProfile)
        const profile = await getUserProfile(accessToken);

        // Save the access token and user profile information
        saveUserAuthData(accessToken, profile);

        // Redirect to a success page or send a success response
        res.redirect('/twitch/success');  // Modify to your success page URL
    } catch (error) {
        // Handle errors and redirect to failure page
        console.error(error);
        // res.redirect('/login-failed');  // Modify to your failure page URL
    }
}, true);

// Function to fetch the user profile from Twitch API
async function getUserProfile(accessToken) {
    try {
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
            }
        });

        return response.data;
    } catch (error) {
        throw new Error('Failed to fetch user profile: ' + error.message);
    }
}


// Function to get Twitch authentication URL
function getTwitchAuthURL() {
    return `https://gdlqbot.superdev.one/auth/twitch`;
}

// Function to check if a token is valid
async function isTokenValid(token) {
    try {
        // Replace this URL with the actual endpoint that verifies the token
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-ID': botConfig.TwitchClientID // Replace with your Twitch Client ID
            }
        });

        // If the response status is 200, the token is valid
        return response.status === 200;
    } catch (error) {
        // Token is invalid or an error occurred
        return false;
    }
}

module.exports = {
    twitchRouter,
    getTwitchAuthURL,
    isTokenValid
};
