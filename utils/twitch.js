const botConfig = require('../auth-config.json');

/**
 * Validates the presence of required Twitch API credentials
 * @returns {boolean} Whether all required credentials are present
 */
const validateTwitchCredentials = () => {
    const requiredCredentials = ['TwitchAccessToken', 'TwitchAccessUserID', 'TwitchClientID'];
    return requiredCredentials.every(credential =>
        botConfig[credential] && typeof botConfig[credential] === 'string'
    );
};

/**
 * Get the common headers required for Twitch API requests
 * @returns {Object} Headers object for Twitch API requests
 * @throws {Error} If credentials are missing
 */
const getTwitchHeaders = () => {
    if (!validateTwitchCredentials()) {
        throw new Error('Missing required Twitch API credentials in auth-config.json');
    }

    return {
        'Authorization': `Bearer ${botConfig.TwitchAccessToken}`,
        'Client-Id': botConfig.TwitchClientID,
        'Content-Type': 'application/json',
    };
};

/**
 * Valid colors for Twitch announcements
 */
const VALID_ANNOUNCEMENT_COLORS = ['blue', 'green', 'orange', 'purple', 'primary'];

/**
 * Sends an announcement to a Twitch chat
 * @param {string} message - The announcement message (max 500 characters)
 * @param {string} broadcasterId - The ID of the broadcaster's channel
 * @param {Object} options - Additional options
 * @param {string} [options.color='primary'] - The color of the announcement
 * @param {string} [options.moderatorId] - The ID of the moderator/broadcaster sending the announcement
 * @returns {Promise<Response>} The API response
 * @throws {Error} If the request fails or parameters are invalid
 */
const sendAnnouncement = async (message, broadcasterId, options = {}) => {
    if (!message || typeof message !== 'string') {
        throw new Error('Message is required and must be a string');
    }

    if (!broadcasterId) {
        throw new Error('Broadcaster ID is required');
    }

    const color = options.color || 'primary';
    if (!VALID_ANNOUNCEMENT_COLORS.includes(color)) {
        throw new Error(`Invalid color. Must be one of: ${VALID_ANNOUNCEMENT_COLORS.join(', ')}`);
    }

    const moderatorId = options.moderatorId || botConfig.TwitchAccessUserID;
    if (!moderatorId) {
        throw new Error('Moderator ID is required either in options or auth-config.json');
    }

    // Truncate message if longer than 500 characters
    const truncatedMessage = message.slice(0, 500);

    try {
        const response = await fetch(
            `https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${moderatorId}`,
            {
                method: 'POST',
                headers: getTwitchHeaders(),
                body: JSON.stringify({
                    message: truncatedMessage,
                    color,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Twitch API Error: ${error.message || response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('Failed to send Twitch announcement:', error);
        throw error;
    }
};

/**
 * Example usage of sending an announcement
 * @param {string} message - The announcement message
 * @returns {Promise<void>}
 */
const sendChannelAnnouncement = async (message) => {
    try {
        await sendAnnouncement(
            message,
            botConfig.TwitchAccessUserID,
            {color: 'purple'}
        );
        console.log('Announcement sent successfully');
    } catch (error) {
        console.error('Failed to send announcement:', error);
    }
};

// Export all utility functions
module.exports = {
    validateTwitchCredentials,
    getTwitchHeaders,
    sendAnnouncement,
    sendChannelAnnouncement,
    VALID_ANNOUNCEMENT_COLORS,
};