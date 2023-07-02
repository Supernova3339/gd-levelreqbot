const fs = require('fs');
const tmi = require('tmi.js');

const configFile = fs.readFileSync('config.json');
const config = JSON.parse(configFile);
const {
  botUsername,
  botToken,
  channel,
  streamerUsername,
  viewerRequestLimit,
  subscriberRequestLimit,
  commandNames
} = config;

const {
  levelRequest,
  removeLevelCommand,
  setRequestLimit,
  randomLevelCommand,
  currentLevel,
  nextLevelCommand,
  queueCommand,
  clearQueueCommand
} = commandNames;

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

// Initialize the request counters for each viewer
const viewerRequestCounts = {};
const subscriberRequestCounts = {};

// Twitch Client Configuration
const twitchConfig = {
  identity: {
    username: botUsername,
    password: botToken
  },
  channels: [channel]
};

// Create a Twitch client
const client = new tmi.client(twitchConfig);

// Connect to Twitch
client.connect().catch(console.error);

// Event triggered when the bot successfully connects to Twitch chat
client.on('connected', () => {
  console.log(`Connected to ${config.channel}'s chat!`);
});

// Save subscriber queue to file
function saveSubscriberQueue() {
  const subscriberQueueFile = JSON.stringify(subscriberQueue);
  fs.writeFileSync('subscribers.json', subscriberQueueFile);
}

// Save viewer queue to file
function saveViewerQueue() {
  const viewerQueueFile = JSON.stringify(viewerQueue);
  fs.writeFileSync('viewers.json', viewerQueueFile);
}

// Extract the level ID from the command message
function extractLevelId(message) {
  const levelId = message.trim().split(' ')[1];
  const isNumeric = /^\d+$/.test(levelId); // Check if levelId is numeric

  if (levelId && levelId.length >= 3 && levelId.length <= 9 && isNumeric) {
    return parseInt(levelId, 10);
  }

  return null;
}


// Check if a viewer has reached the request limit
function hasReachedRequestLimit(username, isSubscriber) {
  const queue = isSubscriber ? subscriberQueue : viewerQueue;
  const requestLimit = isSubscriber ? subscriberRequestLimit : viewerRequestLimit;

  // Count the number of levels in the queue for the viewer
  const viewerLevels = queue.filter((level) => level.username === username);

  return viewerLevels.length >= requestLimit;
}

// Viewer adds a level to the queue
function addLevelToQueue(levelId, isSubscriber, username,) {
  const queue = isSubscriber ? subscriberQueue : viewerQueue;
  const requestLimit = isSubscriber ? subscriberRequestLimit : viewerRequestLimit;

  // Check the current number of levels in the queue for the viewer
  const viewerLevels = queue.filter((level) => level.username === username);

  if (viewerLevels.length >= requestLimit) {
    client.say(config.channel, `Sorry, you have reached your request limit of ${requestLimit} level(s).`);
    return;
  }

  queue.push({ levelId, isSubscriber, username });
  saveSubscriberQueue(); // Save the subscriber queue
  saveViewerQueue(); // Save the viewer queue
  client.say(config.channel, `Level ${levelId} added to the queue for ${username}.`);
}

// Clear the entire level queue
function clearQueue() {
  viewerQueue = [];
  subscriberQueue = [];
  saveSubscriberQueue(); // Save the subscriber queue
  saveViewerQueue(); // Save the viewer queue
  return 'The level queue has been cleared.';
}

// Remove a specific level from the queue
function removeLevel(levelId) {
  const viewerIndex = viewerQueue.findIndex((level) => level.levelId === levelId);
  const subscriberIndex = subscriberQueue.findIndex((level) => level.levelId === levelId);

  if (!levelId) {
    return 'No level ID was submitted for removal.';
  }

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
function getCurrentViewerLevel() {
  if (viewerQueue.length === 0) {
    return 'No level in the viewer queue.';
  }

  const { levelId, username } = viewerQueue[0];
  return `Viewer Level ${levelId} (Submitted by: ${username})`;
}

// Get the current subscriber level
function getCurrentSubscriberLevel() {
  if (subscriberQueue.length === 0) {
    return 'No level in the subscriber queue.';
  }

  const { levelId, username } = subscriberQueue[0];
  return `Subscriber Level ${levelId} (Submitted by: ${username})`;
}

// Twitch chat command handlers
client.on('message', (channel, tags, message) => {
  const { username } = tags;

  if (message.startsWith(commandNames.levelRequest)) {
    const levelId = extractLevelId(message);
    if (levelId) {
      const isSubscriber = tags.subscriber || tags.mod || username === streamerUsername;
      if (hasReachedRequestLimit(username, isSubscriber)) {
        client.say(channel, `Sorry, you have reached your request limit of ${isSubscriber ? subscriberRequestLimit : viewerRequestLimit} level(s).`);
      } else {
        addLevelToQueue(levelId, isSubscriber, username);
      }
    } else {
      client.say(channel, 'Invalid level ID. Please provide a level ID between 3 and 9 characters.');
    }
  } else if (message.startsWith(commandNames.currentLevel) && (tags.mod || username === streamerUsername)) {
    const currentViewerLevel = getCurrentViewerLevel();
    const currentSubscriberLevel = getCurrentSubscriberLevel();
    const currentLevelsMessage = `Current Levels: ${currentViewerLevel} | ${currentSubscriberLevel}`;
    client.say(channel, currentLevelsMessage);
  } else if (message.startsWith(commandNames.nextLevelCommand) && (tags.mod || username === streamerUsername)) {
    const next = goToNextLevel();
    client.say(channel, next);
    
  } else if (message.startsWith(commandNames.queueCommand)) {
    // Display the current state of the queues
    const viewerQueueMessage = getViewerQueueMessage();
    const subscriberQueueMessage = getSubscriberQueueMessage();
    const queueMessage = `${viewerQueueMessage}\n${subscriberQueueMessage}`;
    client.say(channel, queueMessage);
  } else if (message.startsWith(commandNames.clearQueueCommand) && (tags.mod || username === streamerUsername)) {
    // Handle clear queue command
    const result = clearQueue();
    client.say(channel, result);
  } else if (message.startsWith(commandNames.removeLevelCommand) && (tags.mod || username === streamerUsername)) {
    // Handle remove level command
    const levelId = message.split(' ')[1];
    const result = removeLevel(levelId);
    client.say(channel, result);
  }
});

// Get the formatted viewer queue message
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

// Save the queues to files when the bot is shut down
process.on('SIGINT', () => {
  saveSubscriberQueue();
  saveViewerQueue();
  process.exit();
});
