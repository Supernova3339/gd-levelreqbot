const { getGJUsers20, getGJLevels21 } = require("../gd");

async function searchGJProfile(req, res) {
    const { accountID } = req.body;

    if (!accountID) {
        return res.status(400).json({ error: 'Account ID is required' });
    }

    try {
        const userData = await getGJUsers20(accountID);
        if (userData) {
            res.status(200).json(userData);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
}

async function searchGJLevel(req, res) {
    const { str, star, type } = req.body;

    if (!str || star === undefined || type === undefined) {
        return res.status(400).json({ error: 'Level search parameters are required' });
    }

    try {
        const levelData = await getGJLevels21(str, star, type);
        if (levelData) {
            res.status(200).json(levelData);
        } else {
            res.status(404).json({ error: 'No levels found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch level data' });
    }
}

module.exports = { searchGJProfile, searchGJLevel };
