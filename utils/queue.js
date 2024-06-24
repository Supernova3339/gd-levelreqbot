const limits = require('../limits.json');
const fs = require("node:fs");
const botConfig = require('../auth-config.json');

let viewerQueue = [];
let subscriberQueue = [];

// Load subscriber and viewer queues from files if they exist
if (fs.existsSync('subscribers.json')) {
    const subscriberQueueFile = fs.readFileSync('subscribers.json');
    subscriberQueue = JSON.parse(subscriberQueueFile);
}

if (fs.existsSync('viewers.json')) {
    const viewerQueueFile = fs.readFileSync('viewers.json');
    viewerQueue = JSON.parse(viewerQueueFile);
}

// Save subscriber queue to file
/**
 * Saves the subscriber queue to a file.
 *
 * @function saveSubscriberQueue
 * @returns {void}
 */
function saveSubscriberQueue() {
    const subscriberQueueFile = JSON.stringify(subscriberQueue);
    fs.writeFileSync('subscribers.json', subscriberQueueFile);
}

// Save viewer queue to file
/**
 * Saves the viewer queue to a file named 'viewers.json'.
 *
 * @function saveViewerQueue
 * @returns {void}
 */
function saveViewerQueue() {
    const viewerQueueFile = JSON.stringify(viewerQueue);
    fs.writeFileSync('viewers.json', viewerQueueFile);
}


// Check if a viewer has reached the request limit
/**
 * Check if a user has reached the request limit.
 *
 * @param {string} username - The username of the user.
 * @param {boolean} isSubscriber - Whether the user is a subscriber or not.
 *
 * @returns {boolean} - True if the user has reached the request limit, otherwise false.
 */
function hasReachedRequestLimit(username, isSubscriber) {
    const queue = isSubscriber ? subscriberQueue : viewerQueue;
    const requestLimit = isSubscriber ? limits.subscriberRequestLimit : limits.viewerRequestLimit;

    // Count the number of levels in the queue for the viewer
    const viewerLevels = queue.filter((level) => level.username === username);

    return viewerLevels.length >= requestLimit;
}

// Viewer adds a level to the queue
/**
 * Adds a level to the appropriate queue based on the user's subscription status and username.
 *
 * @param {number} levelId - The ID of the level to be added to the queue.
 * @param {boolean} isSubscriber - Indicates whether the user is a subscriber or not.
 * @param {string} username - The username of the user.
 * @param {function} client - Hook for TMI.js
 *
 * @return {void} - This function does not return any value.
 */
function addLevelToQueue(levelId, isSubscriber, username, client) {
    const queue = isSubscriber ? subscriberQueue : viewerQueue;
    const requestLimit = isSubscriber ? limits.subscriberRequestLimit : limits.viewerRequestLimit;

    // Check the current number of levels in the queue for the viewer
    const viewerLevels = queue.filter((level) => level.username === username);

    if (viewerLevels.length >= requestLimit) {
        client.say(botConfig.channel, `Sorry, you have reached your request limit of ${requestLimit} level(s).`);
        return;
    }

    queue.push({ levelId, isSubscriber, username });
    saveSubscriberQueue(); // Save the subscriber queue
    saveViewerQueue(); // Save the viewer queue
    client.say(botConfig.channel, `Level ${levelId} added to the queue for ${username}.`);
}

// Clear the entire level queue
/**
 *
 */
function clearQueue() {
    viewerQueue = [];
    subscriberQueue = [];
    saveSubscriberQueue(); // Save the subscriber queue
    saveViewerQueue(); // Save the viewer queue
    return 'The level queue has been cleared.';
}

// Remove a specific level from the queue
/**
 * Removes a level from the queue by level ID.
 *
 * @param {string} levelId - The ID of the level to be removed.
 * @return {string} - A message indicating the result of the removal operation.
 *                    Possible messages are:
 *                    - "No level ID was submitted for removal." if levelId is not provided.
 *                    - "Level <levelId> has been removed from the queue." if the level is found and removed.
 *                    - "Level <levelId> was not found in the queue." if the level is not found in the queue.
 */
function removeLevel(levelId) {
    if (!levelId) {
        return 'No level ID was submitted for removal.';
    }

    // Assuming levelId is a string and level.levelId are numbers, parse levelId to number
    const levelIdNumber = parseInt(levelId, 10);

    const viewerIndex = viewerQueue.findIndex((level) => level.levelId === levelIdNumber);
    const subscriberIndex = subscriberQueue.findIndex((level) => level.levelId === levelIdNumber);

    if (viewerIndex !== -1) {
        viewerQueue.splice(viewerIndex, 1);
        saveViewerQueue(); // Save the viewer queue
        return `Level ${levelId} has been removed from the queue.`;
    }

    if (subscriberIndex !== -1) {
        subscriberQueue.splice(subscriberIndex, 1);
        saveSubscriberQueue(); // Save the subscriber queue
        return `Level ${levelId} has been removed from the queue.`;
    }

    return `Level ${levelId} was not found in the queue.`;
}

// Streamer or moderator gets a random level from the queue
/**
 * Returns a random level from the queue based on probability.
 *
 * @returns {string} The selected level from the queue or a message indicating
 *  that both the subscriber and viewer queues are empty.
 */
function getRandomLevelFromQueue() {
    let selectedQueue;
    let queueType;

    // Generate a random number between 0 and 99
    const randomChance = Math.floor(Math.random() * 100);

    // Check if the subscriber queue is not empty and the random chance is below 60 (60% probability)
    if (subscriberQueue.length > 0 && randomChance < 60) {
        selectedQueue = subscriberQueue;
        queueType = 'Subscriber';
    } else if (viewerQueue.length > 0) {
        selectedQueue = viewerQueue;
        queueType = 'Viewer';
    }

    if (selectedQueue && selectedQueue.length > 0) {
        const randomIndex = Math.floor(Math.random() * selectedQueue.length);
        const randomLevel = selectedQueue[randomIndex];
        selectedQueue.splice(randomIndex, 1); // Remove the level from the queue
        saveSubscriberQueue(); // Save the subscriber queue
        saveViewerQueue(); // Save the viewer queue
        return `${queueType ? queueType + ' ' : ''}level ${randomLevel.levelId}`;
    }

    return 'Both the subscriber and viewer queues are currently empty.';
}

// Streamer or moderator goes to the next level in the queue
/**
 * Moves to the next level in the selected queue based on certain conditions.
 *
 * @return {string} The information about the next level to go, or a message indicating that both the subscriber and viewer queues are empty.
 */
function goToNextLevel() {
    let selectedQueue;
    let queueType;

    // Generate a random number between 0 and 99
    const randomChance = Math.floor(Math.random() * 100);

    // Check if the subscriber queue is not empty and the random chance is below 60 (60% probability)
    if (subscriberQueue.length > 0 && randomChance < 60) {
        selectedQueue = subscriberQueue;
        queueType = 'Subscriber';
    } else if (viewerQueue.length > 0) {
        selectedQueue = viewerQueue;
        queueType = 'Viewer';
    }

    if (selectedQueue && selectedQueue.length > 0) {
        const nextLevelObj = selectedQueue.shift(); // Get and remove the next level object from the queue
        const nextLevel = nextLevelObj.levelId; // Extract the level ID from the level object
        const username = nextLevelObj.username; // Extract the requester username from the level object
        saveSubscriberQueue(); // Save the subscriber queue
        saveViewerQueue(); // Save the viewer queue

        return `Next ${queueType} Level: ${nextLevel}  (Submitted by: ${username})`;
    } else {
        const isSubscriberQueueEmpty = subscriberQueue.length === 0;
        const isViewerQueueEmpty = viewerQueue.length === 0;

        if (isSubscriberQueueEmpty && isViewerQueueEmpty) {
            return 'Both the subscriber and viewer queues are currently empty.';
        }
    }
}

// Get the current viewer level
/**
 * Retrieves the current viewer level from the viewer queue.
 *
 * @returns {string} The current viewer level information.
 *   Returns "No level in the viewer queue." if the viewer queue is empty,
 *   otherwise returns a formatted string with the viewer level ID and username.
 */
function getCurrentViewerLevel() {
    if (viewerQueue.length === 0) {
        return 'No level in the viewer queue.';
    }

    const { levelId, username } = viewerQueue[0];
    return `Viewer Level ${levelId} (Submitted by: ${username})`;
}

// Get the current subscriber level
/**
 * Retrieves the current subscriber level from the subscriber queue.
 * If there is no level in the queue, it returns a specific message indicating that.
 * If there is a level in the queue, it returns a formatted string with the level ID and username.
 *
 * @returns {string} The current subscriber level in the format:
 *                   "Subscriber Level <levelId> (Submitted by: <username>)"
 *                   or "No level in the subscriber queue." if the queue is empty.
 */
function getCurrentSubscriberLevel() {
    if (subscriberQueue.length === 0) {
        return 'No level in the subscriber queue.';
    }

    const { levelId, username } = subscriberQueue[0];
    return `Subscriber Level ${levelId} (Submitted by: ${username})`;
}

// Get the formatted viewer queue message
/**
 * Retrieve the viewer queue message.
 *
 * The method builds a message string from the viewer queue, and returns it.
 * If the viewer queue is empty or all levels are marked as removed,
 * the method returns 'Viewer Queue is empty.'
 *
 * @returns {string} - The viewer queue message.
 */
function getViewerQueueMessage() {
    if (viewerQueue.length === 0) {
        return 'Viewer Queue is empty.';
    }

    const filteredQueue = viewerQueue.filter((level) => !level.removed); // Remove levels marked as removed

    if (filteredQueue.length === 0) {
        return 'Viewer Queue is empty.';
    }

    const queueMessage = filteredQueue
        .map((level, index) => `#${index + 1}: Level ${level.levelId} (Submitted by: ${level.username})`)
        .join(' | ');

    return `Viewer Queue: ${queueMessage}`;
}

// Get the formatted subscriber queue message
/**
 *
 */
function getSubscriberQueueMessage() {
    if (subscriberQueue.length === 0) {
        return 'Subscriber Queue is empty.';
    }

    const filteredQueue = subscriberQueue.filter((level) => !level.removed); // Remove levels marked as removed

    if (filteredQueue.length === 0) {
        return 'Subscriber Queue is empty.';
    }

    const queueMessage = filteredQueue
        .map((level, index) => `#${index + 1}: Level ${level.levelId} (Submitted by: ${level.username})`)
        .join(' | ');

    return `Subscriber Queue: ${queueMessage}`;
}

module.exports  = { hasReachedRequestLimit, addLevelToQueue, getViewerQueueMessage, getSubscriberQueueMessage, removeLevel, clearQueue, goToNextLevel, saveSubscriberQueue, saveViewerQueue};
