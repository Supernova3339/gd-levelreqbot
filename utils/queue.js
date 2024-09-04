const limits = require('../limits.json');
const fs = require("node:fs");
const botConfig = require('../auth-config.json');
const modes = require('../modes.json');

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
 * @param {boolean} noFeedbackMessage - Indicates weather to disable a feedback message or not
 *
 * @return {void} - This function does not return any value.
 */
function addLevelToQueue(levelId, isSubscriber, username, client, noFeedbackMessage) {
    // check if level already exists in either queue before adding
    const existingLevel = searchQueue(levelId);
    if (existingLevel !== 'Level was not found in either queue.') {
        if (!noFeedbackMessage) {
            client.say(botConfig.channel, `Level ${levelId} is already in the queue.`);
        }
        return;
    }

    // rest of code remains the same
    if (isSubscriber && !modes.sub) {
        viewerQueue.push({levelId, isSubscriber: false, username});
        saveViewerQueue(); // Save the viewer queue
        client.say(botConfig.channel, `Level ${levelId} added to the queue for ${username}.`);
        return;
    }

    const queue = isSubscriber ? subscriberQueue : viewerQueue;
    const requestLimit = isSubscriber ? limits.subscriberRequestLimit : limits.viewerRequestLimit;

    // Check the current number of levels in the queue for the viewer
    const viewerLevels = queue.filter((level) => level.username === username);

    if (viewerLevels.length >= requestLimit) {
        client.say(botConfig.channel, `Sorry, you have reached your request limit of ${requestLimit} level(s).`);
        return;
    }

    queue.push({levelId, isSubscriber, username});

    if (isSubscriber) {
        saveSubscriberQueue(); // Save the subscriber queue
    } else {
        saveViewerQueue(); // Save the viewer queue
    }

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
 * @param {number|null} levelId - The ID of the level to be removed.
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

function searchQueue(levelId) {
    if (!levelId) {
        return 'No level ID was submitted for search.';
    }

    const levelIdNumber = parseInt(levelId, 10);

    const levelInViewerQueue = viewerQueue.find((level) => level.levelId === levelIdNumber);
    const levelInSubscriberQueue = subscriberQueue.find((level) => level.levelId === levelIdNumber);

    if (levelInViewerQueue) {
        return levelInViewerQueue;
    }

    if (levelInSubscriberQueue) {
        return levelInSubscriberQueue;
    }

    return 'Level was not found in either queue.';
}

/**
 * Gets the position of a level in either the viewer or subscriber queue.
 *
 * @param {string} levelId - The ID of the level to find.
 * @returns {Object|string} Returns an object with the position and queue type,
 *                          or an error message if the level is not found.
 *
 * @example
 *
 * // Assuming that level 123 is at position 1 in the viewer queue
 * getQueuePosition('123');
 * // returns { position: 1, queue: 'Viewer' }
 *
 * // Assuming that level 456 is at position 8 in the subscriber queue
 * getQueuePosition('456');
 * // returns { position: 8, queue: 'Subscriber' }
 *
 * getQueuePosition('789');
 * // returns 'Level was not found in either queue.'
 */
function getQueuePosition(levelId) {
    if (!levelId) {
        return 'No level ID was submitted for search.';
    }

    const levelIdNumber = parseInt(levelId, 10);

    const levelInViewerQueueIndex = viewerQueue.findIndex((level) => level.levelId === levelIdNumber);
    const levelInSubscriberQueueIndex = subscriberQueue.findIndex((level) => level.levelId === levelIdNumber);

    if (levelInViewerQueueIndex >= 0) {
        return {position: levelInViewerQueueIndex + 1, queue: 'Viewer'}; // Add 1 to make the position 1-based instead of 0-based
    }

    if (levelInSubscriberQueueIndex >= 0) {
        return {position: levelInSubscriberQueueIndex + 1, queue: 'Subscriber'}; // Add 1 to make the position 1-based instead of 0-based
    }

    if (modes.sub) {
        return 'Level was not found in either queue.';
    } else {
        return 'Level was not found in the queue.';
    }
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

    // If the subscriber queue is disabled, add all levels to viewer queue
    if (!modes.sub && subscriberQueue.length > 0) {
        viewerQueue.push(...subscriberQueue);
        subscriberQueue = [];
    }

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
        const nextLevelObj = selectedQueue.shift();
        const nextLevel = nextLevelObj.levelId;
        const username = nextLevelObj.username;
        saveSubscriberQueue();
        saveViewerQueue();

        return `Next ${queueType} Level: ${nextLevel}  (Submitted by: ${username}). Run !info ${nextLevel} for more information!`;
    } else {
        const isSubscriberQueueEmpty = subscriberQueue.length === 0;
        const isViewerQueueEmpty = viewerQueue.length === 0;

        if (isSubscriberQueueEmpty && isViewerQueueEmpty) {
            if(modes.sub) {
                return 'Both the subscriber and viewer queues are currently empty.';
            } else {
                return 'The viewer queue is currently empty.';
            }
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

    const {levelId, username} = viewerQueue[0];
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

    const {levelId, username} = subscriberQueue[0];
    return `Subscriber Level ${levelId} (Submitted by: ${username})`;
}

// Get the formatted viewer queue message
// Set a constant for the number of items per page
const ITEMS_PER_PAGE = 5;

/**
 * Retrieve the viewer queue message.
 *
 * The method builds a message string from the viewer queue, and returns it.
 * If the viewer queue is empty or all levels are marked as removed,
 * the method returns 'Viewer Queue is empty.'
 *
 * @returns {string} - The viewer queue message.
 */
function getViewerQueueMessage(pageNumber = 1, itemsPerPage = ITEMS_PER_PAGE) {
    // console.log(`getViewerQueueMessage called with pageNumber: ${pageNumber} and itemsPerPage: ${itemsPerPage}`);

    if (viewerQueue.length === 0) {
        console.log('Viewer Queue is empty.');
        return 'Viewer Queue is empty.';
    }

    const totalPages = Math.ceil(viewerQueue.length / itemsPerPage);

    const start = (pageNumber - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageViewerQueue = viewerQueue.slice(start, end);

    // console.log(`pageViewerQueue: ${JSON.stringify(pageViewerQueue)}`);

    const filteredQueue = pageViewerQueue.filter((level) => !level.removed);

    if (filteredQueue.length === 0) {
        // console.log('Filtered Viewer Queue is empty.');
        return 'Viewer Queue is empty.';
    }

    const queueMessage = filteredQueue.map((level, index) => `#${start + index + 1}: Level ${level.levelId} (Submitted by: ${level.username})`).join(' | ');

    // console.log(`Viewer Queue Message: ${queueMessage}`);

    return `Viewer Queue (Page ${pageNumber}/${totalPages}): ${queueMessage}`;
}

function getSubscriberQueueMessage(pageNumber = 1, itemsPerPage = ITEMS_PER_PAGE) {
    // console.log(`getSubscriberQueueMessage called with pageNumber: ${pageNumber} and itemsPerPage: ${itemsPerPage}`);

    if (!modes.sub) {
        // console.log('Subscriber Queue is currently disabled.');
        return 'Subscriber Queue is currently disabled.';
    }

    const totalPages = Math.ceil(subscriberQueue.length / itemsPerPage);

    const start = (pageNumber - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageSubscriberQueue = subscriberQueue.slice(start, end);

    // console.log(`pageSubscriberQueue: ${JSON.stringify(pageSubscriberQueue)}`);

    if (pageSubscriberQueue.length === 0) {
        // console.log('No level in the subscriber queue.');
        return 'No level in the subscriber queue.';
    }

    const queueMessage = pageSubscriberQueue.map((level, index) => `#${start + index + 1}: Level ${level.levelId} (Submitted by: ${level.username})`).join(' | ');

    // console.log(`Subscriber Queue Message: ${queueMessage}`);

    return `Subscriber Queue (Page ${pageNumber}/${totalPages}): ${queueMessage}`;
}

module.exports = {
    hasReachedRequestLimit,
    addLevelToQueue,
    getViewerQueueMessage,
    getSubscriberQueueMessage,
    getQueuePosition,
    removeLevel,
    clearQueue,
    goToNextLevel,
    saveSubscriberQueue,
    saveViewerQueue,
    searchQueue
};
