const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const {createRoute} = require('../webHelper');
const botConfig = require('../../auth-config.json');

// Twitch credentials
const TWITCH_CLIENT_ID = botConfig.TwitchClientID;
const TWITCH_SECRET = botConfig.TwitchClientSecret;

// Initialize Express router for Twitch
const twitchRouter = express.Router();

// Function to get Twitch authentication URL
function getTwitchAuthURL() {
    return `http://localhost:3000/auth/twitch`; // Auth Server Twitch URL
}

// Function to check if a token is valid
async function isTokenValid(token) {
    try {
        // Endpoint that verifies the token
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-ID': botConfig.TwitchClientID // Twitch Client ID
            }
        });

        // If the response status is 200, the token is valid
        return response.status === 200;
    } catch (error) {
        // Token is invalid or an error occurred
        return false;
    }
}

// Save user's access token and username to the auth-config.json file
function saveUserAuthData(accessToken, profile) {
    const configPath = path.join(__dirname, '../../auth-config.json');
    const updatedConfig = {
        ...botConfig,
        TwitchAccessToken: accessToken,
        TwitchUsername: profile.data[0].login,  // Save username
        TwitchAccessUserID: profile.data[0].id // Save id
    };

    // Write updated config to file
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
}

// Route to handle Twitch token authentication
createRoute(twitchRouter, 'get', '/twitch/auth/token', async (req, res) => {
    const {accessToken} = req.query;

    return 'access token: ' + accessToken;

    // try {
    //     // First, validate the token
    //     const tokenValid = await isTokenValid(accessToken);
    //
    //     if (!tokenValid) {
    //         return res.redirect('/twitch/failure');
    //     }
    //
    //     // Fetch user profile to save
    //     const userProfile = await axios.get('https://api.twitch.tv/helix/users', {
    //         headers: {
    //             'Authorization': `Bearer ${accessToken}`,
    //             'Client-ID': TWITCH_CLIENT_ID
    //         }
    //     });
    //
    //     // Save user data
    //     saveUserAuthData(accessToken, userProfile);
    //
    //     // Redirect to success page
    //     res.redirect('/twitch/success');
    // } catch (error) {
    //     console.error('Authentication error:', error);
    //     res.redirect('/twitch/failure');
    // }
}, true);

module.exports = {
    twitchRouter,
    getTwitchAuthURL,
    isTokenValid
};