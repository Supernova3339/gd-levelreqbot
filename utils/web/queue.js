const {
    getQueuePosition, removeLevel, addLevelToQueue, goToNextLevel, getSubscriberQueueMessage,
    getViewerQueueMessage, clearQueue
} = require("../queue");
const limits = require("../../limits.json");

async function getUserQueuePosition(req, res) {
    try {
        const requestData = req.body;
        const requestId = requestData['id'];
        const result = await getQueuePosition(requestId);

        if (result === "Level was not found in either queue." || result === "Level was not found in the queue.") {
            res.status(500).send(result);
        } else {
            res.status(200).send(result);
        }
    } catch (error) {
        console.error("Error handling queue position:", error);
        res.status(500).send("Internal server error");
    }
}

async function removeFromQueue(req, res) {
    try {
        const requestData = req.body;
        const requestId = requestData['id'];
        const result = removeLevel(requestId);

        if (result === `Level ${requestId} was not found in the queue.`) {
            res.status(500).send(result);
        } else {
            res.status(200).send(result);
        }
    } catch (error) {
        console.error("Error deleting data from queue:", error);
        res.status(500).send("Internal server error");
    }
}

async function clearEntireQueue(req, res) {
    try {
        const result = clearQueue();
        // const result = "queue not actually cleared";

        res.status(200).send(result);
    } catch (error) {
        console.error("Error clearing queue:", error);
        res.status(500).send("Internal server error");
    }
}

async function addDataToQueue(req, res) {
    try {
        const requestData = req.body;
        const requestId = requestData['id'];
        const requestName = requestData['name'];
        const requestIsSubscriber = requestData['isSubscriber'];
        const noFeedbackMessage = false;
        const requestLimit = requestIsSubscriber ? limits.subscriberRequestLimit : limits.viewerRequestLimit;
        const result = addLevelToQueue(requestId, requestIsSubscriber, requestName, noFeedbackMessage);

        if (result === `Level ${requestId} is already in the queue.` || result === `Sorry, you have reached your request limit of ${requestLimit} level(s).\`){`) {
            res.status(500).send(result);
        } else {
            res.status(200).send(result);
        }
    } catch (error) {
        console.error("Error adding data to queue:", error);
        res.status(500).send("Internal server error");
    }
}

async function nextLevelInQueue(req, res) {
    try {
        const result = goToNextLevel();

        if (result.message) {
            res.status(200).json({message: result.message});
        } else {
            res.status(200).json({
                queueType: result.queueType,
                levelId: result.levelId,
                username: result.username
            });
        }
    } catch (error) {
        console.error("Error going to next level in queue:", error);
        res.status(500).send("Internal server error");
    }
}

async function listQueueItems(req, res) {
    try {
        // Extract and parse parameters from the request body
        const requestData = req.body;

        // Convert page and items to numbers and set defaults if necessary
        const pageNumber = isNaN(Number(requestData['page'])) ? 1 : Number(requestData['page']); // Fallback to 1 if invalid
        const itemsPerPage = isNaN(Number(requestData['items'])) ? 5 : Number(requestData['items']); // Fallback to 5 if invalid
        const queueType = requestData['queueType'] || "viewer"; // Fallback to viewer

        // console.log("Request Data:", (requestData));

        let queueMessage;

        // Check the queue type and get the appropriate message
        if (queueType === 'subscriber') {
            queueMessage = getSubscriberQueueMessage(pageNumber, itemsPerPage);
        } else {
            queueMessage = getViewerQueueMessage(pageNumber, itemsPerPage);
        }

        // Return the queue message as JSON response
        res.status(200).json({ queueMessage });
    } catch (error) {
        // Handle errors and return an internal server error
        console.error("Error listing queue items:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}



module.exports = {
    getUserQueuePosition,
    removeFromQueue,
    clearEntireQueue,
    addDataToQueue,
    nextLevelInQueue,
    listQueueItems
};