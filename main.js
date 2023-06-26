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
  subscriberRequestLimit, // Add separate request limit for subscribers
  blacklistedLevels,
  commandNames
} = config;

const {
  levelRequest,
  removeLevel,
  banViewer,
  unbanViewer,
  setRequestLimit,
  randomLevel,
  currentLevel,
  nextLevel,
  queueCommand
} = commandNames;

// Initialize the viewer and subscriber queues as empty arrays
const viewerQueue = [];
const subscriberQueue = [];

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

// Extract the level ID from the command message
function extractLevelId(message) {
  const command = message.trim().split(' ')[0];

  if (command === randomLevel) {
    return randomLevel; // Return the random command identifier
  }

  const levelId = message.trim().split(' ')[1];
  if (levelId && levelId.length >= 3 && levelId.length <= 9) {
    return levelId;
  }
  return null;
}

function hasReachedRequestLimit(username, isSubscriber) {
  const queue = isSubscriber ? subscriberQueue : viewerQueue;
  const requestLimit = isSubscriber ? subscriberRequestLimit : viewerRequestLimit;

  // Count the number of levels in the queue for the viewer
  const viewerLevels = queue.filter((level) => level.username === username);

  return viewerLevels.length >= requestLimit;
}  

// Viewer adds a level to the queue
function addLevelToQueue(levelId, isSubscriber, username) {
  const queue = isSubscriber ? subscriberQueue : viewerQueue;
  const requestLimit = isSubscriber ? subscriberRequestLimit : viewerRequestLimit;

  // Check the current number of levels in the queue for the viewer
  const viewerLevels = queue.filter((level) => level.username === username);

  if (viewerLevels.length >= viewerLevels.length + 1) {
    client.say(config.channel, `Sorry, you have reached your request limit of ${requestLimit} level(s).`);
    return;
  }

  queue.push({ levelId, isSubscriber, username });
  client.say(config.channel, `Level ${levelId} added to the queue for ${username}.`);
}  

// Remove a level from the queue
function removeLevelFromQueue(levelId, username) {
  const viewerIndex = viewerQueue.findIndex((level) => level.levelId === levelId && level.username === username);
  const subscriberIndex = subscriberQueue.findIndex((level) => level.levelId === levelId);

  if (viewerIndex !== -1) {
    viewerQueue.splice(viewerIndex, 1);
    return true;
  }

  if (subscriberIndex !== -1) {
    subscriberQueue.splice(subscriberIndex, 1);
    return true;
  }

  return false;
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

  if (selectedQueue) {
    const randomIndex = Math.floor(Math.random() * selectedQueue.length);
    const randomLevel = selectedQueue[randomIndex];
    selectedQueue.splice(randomIndex, 1); // Remove the level from the queue
    return `${queueType ? queueType + ' ' : ''}level ${randomLevel}`;
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

  if (selectedQueue) {
    const nextLevelObj = selectedQueue.shift(); // Get and remove the next level object from the queue
    const nextLevel = nextLevelObj.levelId; // Extract the level ID from the level object
    const username = nextLevelObj.username; // Extract the requester username from the level object
    return `Next ${queueType} Level: ${nextLevel}  (Submitted by: ${username})`;
  }

  return 'Both the subscriber and viewer queues are currently empty.';
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
    return `Subscriber Level ${levelId} ( Submitted By: ${username})`;
  }

// Twitch chat command handlers
client.on('message', (channel, tags, message) => {
  const { username } = tags;

  if (message.startsWith(levelRequest)) {
    const levelId = extractLevelId(message);
    if (levelId) {
      const isSubscriber = tags.subscriber || tags.mod || username === streamerUsername;
      if (hasReachedRequestLimit(username, isSubscriber)) {
        client.say(config.channel, `Sorry, you have reached your request limit of ${isSubscriber ? subscriberRequestLimit : viewerRequestLimit} level(s).`);
      } else {
        addLevelToQueue(levelId, isSubscriber, username);
      }
    } else {
      client.say(config.channel, 'Invalid level ID. Please provide a level ID between 3 and 9 characters.');
    }
  } else if (message.startsWith(removeLevel)) {
    const levelId = extractLevelId(message);
    if (levelId) {
      const removed = removeLevelFromQueue(levelId);
      if (removed) {
        client.say(config.channel, `Level ${levelId} removed from the queue.`);
      } else {
        client.say(config.channel, `Level ${levelId} was not found in the queue.`);
      }
    } else {
      client.say(config.channel, 'Invalid level ID. Please provide a level ID between 3 and 9 characters.');
    }
  } else if (message.startsWith(banViewer) && tags.mod && username === streamerUsername) {
    // Ban viewer from requesting levels
    // todo
  } else if (message.startsWith(unbanViewer) && tags.mod && username === streamerUsername) {
    // Unban viewer from requesting levels
    // todo
  } else if (message.startsWith(setRequestLimit) && tags.mod && username === streamerUsername) {
    // Set the request limit
    // todo
  } else if (message.startsWith(randomLevel) && (tags.mod || username === streamerUsername)) {
    const level = getRandomLevelFromQueue();
    client.say(config.channel, level);
  } else if (message.startsWith(currentLevel) && (tags.mod || username === streamerUsername)) {
    const currentViewerLevel = getCurrentViewerLevel();
    const currentSubscriberLevel = getCurrentSubscriberLevel();
    const currentLevelsMessage = `Current Levels: ${currentViewerLevel} | ${currentSubscriberLevel}`;
    client.say(config.channel, currentLevelsMessage);
} else if (message.startsWith(nextLevel) && (tags.mod || username === streamerUsername)) {
    const next = goToNextLevel();
    client.say(config.channel, next);
} else if (message.startsWith(queueCommand)) {
    // Display the current state of the queues
    const viewerQueueMessage = getViewerQueueMessage();
    const subscriberQueueMessage = getSubscriberQueueMessage();
    const queueMessage = `${viewerQueueMessage}\n${subscriberQueueMessage}`;
    client.say(config.channel, queueMessage);
  }
  
  // Get the formatted viewer queue message
  function getViewerQueueMessage() {
    if (viewerQueue.length === 0) {
      return 'Viewer Queue is empty.';
    }
  
    const queueMessage = viewerQueue
      .map((level, index) => `#${index + 1}: ${level.levelId} (${level.username})`)
      .join(', ');
  
    return `Viewer Queue: ${queueMessage}`;
  }
  
  // Get the formatted subscriber queue message
  function getSubscriberQueueMessage() {
    if (subscriberQueue.length === 0) {
      return 'Subscriber Queue is empty.';
    }
  
    const queueMessage = subscriberQueue
      .map((level, index) => `#${index + 1}: ${level.levelId}`)
      .join(', ');
  
    return `Subscriber Queue: ${queueMessage}`;
  }  
});