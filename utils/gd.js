const axios = require('axios');

/**
 * This function retrieves GJLevels data from the Boomlings database.
 *
 * @param {string|number} str - A value representing the level name or ID.
 * @param {number} star - Rated filter; 0 for unrated, 1 for rated.
 * @param {number} type - Search type. See https://wyliemaster.github.io/gddocs/#/endpoints/levels/getGJLevels21?id=type for more information.
 * @returns {Promise<void>} Returns a promise that resolves to nothing.
 */
async function getGJLevels21(str, star, type) {
    const headers = {
        "User-Agent": "",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    const data = {
        "str": str,
        "star": star,
        "type": type,
        "secret": "Wmfd2893gb7",
    }

    const url = "http://www.boomlings.com/database/getGJLevels21.php"

    try {
        const response = await axios.post(url, data, {headers: headers});
        const decodedLevels = decodeGJLevel21Response(response.data);
        return decodedLevels;
    } catch (error) {
        console.error(`Error: ${error}`)
    }
}

/**
 * Retrieves Geometry Dash user information for a given account ID.
 *
 * @param {number} targetAccountID - The account ID of the person you want the info of.
 * @return {Promise<Array>} Returns a promise that resolves to nothing.
 */
async function getGJUsers20(targetAccountID) {
    const headers = {
        "User-Agent": "",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    const data = {
        "secret": "Wmfd2893gb7",
        "str": targetAccountID,
    }

    const url = "http://www.boomlings.com/database/getGJUsers20.php"

    try {
        const response = await axios.post(url, data, {headers: headers});
        // Return the complete decodedLevels object
        return decodeGJUser20Response(response.data);
    } catch (error) {
        console.error(`Error: ${error}`)
    }
}

/**
 * Decodes the response from getGJLevels21 into an array of level objects.
 *
 * @param {string} response - The response received from GD.
 * @return {Array} - An array of decoded level objects.
 */
function decodeGJLevel21Response(response) {
    const rawLevels = response.split('#');

    const levels = rawLevels.map(rawLevel => {
        const level = {};
        const pairs = rawLevel.split(':');

        for (let i = 0; i < pairs.length; i += 2) {
            const key = pairs[i];
            const value = pairs[i + 1];

            switch (key) {
                case "1":
                    level['levelID'] = parseInt(value);
                    break; // The id of the level
                case "2":
                    level['levelName'] = value;
                    break; // The name of the level
                case "3":
                    level['description'] = Buffer.from(value, 'base64').toString();
                    break; // The level description, encoded in base64
                case "4":
                    level['levelString'] = value;
                    break; 	// All the data for the level
                case "5":
                    level['version'] = parseInt(value);
                    break; // The version of the level published
                case "6":
                    level['playerID'] = parseInt(value);
                    break; // The player ID of the level author
                case "8":
                    level['difficultyDenominator'] = parseInt(value);
                    break; // Returns 0 if the level is N/A, returns 10 if a difficulty is assigned. Historically used to be the amount of people who have voted on the difficulty.
                case "9":
                    level['difficultyNumerator'] = parseInt(value);
                    break; // The nominator used for calculating the level difficulty. Divided by the denominator to get the difficulty icon. Nowadays just 0 = unrated, 10 = easy, 20 = normal, 30 = hard, 40 = harder, 50 = insane. Can be also used to determine the demon difficulty as a side-effect of the voting system. Historically used to be the sum of stars from all votes
                case "10":
                    level['downloads'] = parseInt(value);
                    break; // The amount of times the level has been downloaded
                case "12":
                    level['officialSong'] = parseInt(value);
                    break; // The official song number used by the level, if applicable
                case "13":
                    level['gameVersion'] = parseInt(value);
                    break; // The GD version the level was uploaded in. Versions 1.0 to 1.6 use version numbers 1 to 7 respectively. Version 10 is 1.7. Otherwise, divide the version number by ten to get the correct number.
                case "14":
                    level['likes'] = parseInt(value);
                    break; // likes - dislikes
                case "15":
                    level['length'] = parseInt(value);
                    break; // A number from 0-4, where 0 is tiny and 4 is XL
                case "16":
                    level['dislikes'] = parseInt(value);
                    break; // dislikes - likes
                case "17":
                    level['demon'] = value === "1" ? true : false;
                    break; // If level difficulty is demon
                case "18":
                    level['stars'] = parseInt(value);
                    break; // The amount of stars rewarded for completing the level
                case "19":
                    level['featureScore'] = parseInt(value);
                    break; // 0 if the level is not featured, otherwise a positive number. The higher it is, the higher the level appears on the featured levels list.
                case "25":
                    level['auto'] = value === "1" ? true : false;
                    break; // If the level's difficulty is auto
                case "27":
                    level['password'] = value;
                    break; // The password required to copy the level. It is XOR encrypted with a key of 26364
                case "28":
                    level['uploadDate'] = value;
                    break; // The approximate date the level was uploaded on
                case "29":
                    level['updateDate'] = value;
                    break; // The approximate date the level was last updated on
                case "30":
                    level['copiedID'] = parseInt(value);
                    break; // The ID the of the original level (if the level was copied)
                case "31":
                    level['twoPlayer'] = value === "1" ? true : false;
                    break; // Whether the level uses two player mode
                case "35":
                    level['customSongID'] = parseInt(value);
                    break; // The ID of the custom Newgrounds song used in the level
                case "36":
                    level['extraString'] = value;
                    break; // The extraString passed when uploading the level. Its use is currently unknown
                case "37":
                    level['coins'] = parseInt(value);
                    break; // The number of user coins placed in the level
                case "38":
                    level['verifiedCoins'] = value === "1" ? true : false;
                    break; // If the level's user coins are verified (silver)
                case "39":
                    level['starsRequested'] = parseInt(value);
                    break; // The star value requested for the level
                case "40":
                    level['lowDetailMode'] = value === "1" ? true : false;
                    break; // If the level has a low detail checkbox
                case "41":
                    level['dailyNumber'] = parseInt(value);
                    break; // 	Daily/weekly levels only. Returns which daily/weekly the level was (e.g. the 500th daily level). Subtract 100,000 if the level is weekly
                case "42":
                    level['epic'] = value === "1" ? true : false;
                    break; // If the level has an epic rating
                case "43":
                    level['demonDifficulty'] = parseInt(value);
                    break; // The difficulty of the demon rating. 3 = easy, 4 = medium, 0 = hard, 5 = insane, 6 = extreme. Can also be used to determine the level difficulty non-demons had before rating as a side-effect of the voting system.
                case "44":
                    level['isGauntlet'] = value === "1" ? true : false;
                    break; // if the level is in a gauntlet
                case "45":
                    level['objects'] = parseInt(value);
                    break;  // The amount of objects in the level, used to determine if the level is considered "large". It caps at 65535
                case "46":
                    level['editorTime'] = parseInt(value);
                    break; // The total number of seconds spent on the current copy of a level ( not accurate )
                case "47":
                    level['editorTimeCopies'] = parseInt(value);
                    break; // The accumulative total of seconds spent on previous copies of the level ( not accurate )
            }
        }

        return level;
    });

    return levels;
}

function decodeGJUser20Response(response) {
    const rawUsers = response.split('#');

    const users = rawUsers.map(rawUser => {
        const user = {};
        const pairs = rawUser.split(':');

        for (let i = 0; i < pairs.length; i += 2) {
            const key = pairs[i];
            const value = pairs[i + 1];

            switch (key) {
                case '1':
                    user['userName'] = value;
                    break; // The name of player
                case '2':
                    user['userID'] = parseInt(value);
                    break; // The ID of player
                case '3':
                    user['stars'] = parseInt(value);
                    break; // The count of stars player have
                case '4':
                    user['demons'] = parseInt(value);
                    break; // The count of demons player have
                case '6':
                    user['ranking'] = parseInt(value);
                    break; // the global leaderboard position of the player
                case '7':
                    user['accountHighlight'] = parseInt(value);
                    break; // The accountID of the player. Is used for highlighting the player on the leaderboards
                case '8':
                    user['creatorpoints'] = parseInt(value);
                    break; // The count of creator points player has
                case '9':
                    user['iconID'] = parseInt(value);
                    break; // Showcase icon ID, used for comments
                case '10':
                    user['playerColor'] = parseInt(value);
                    break; // First color of the player use
                case '11':
                    user['playerColor2'] = parseInt(value);
                    break; // Second color of the player use
                case '13':
                    user['secretCoins'] = parseInt(value);
                    break; // The count of coins player have
                case '14':
                    user['iconType'] = parseInt(value);
                    break; // The iconType of the player used
                case '15':
                    user['special'] = parseInt(value);
                    break; // The special number of the player use
                case '16':
                    user['accountID'] = parseInt(value);
                    break; // The accountid of this player
                case '17':
                    user['usercoins'] = parseInt(value);
                    break; // The count of usercoins player have
                case '18':
                    user['messageState'] = parseInt(value);
                    break; // 0: All, 1: Only friends, 2: None
                case '19':
                    user['friendsState'] = parseInt(value);
                    break; // 0: All, 1: None
                case '20':
                    user['youTube'] = value;
                    break; // The youtubeurl of player
                case '21':
                    user['accIcon'] = parseInt(value);
                    break; // The icon number of the player used
                case '22':
                    user['accShip'] = parseInt(value);
                    break; // The ship number of the player used
                case '23':
                    user['accBall'] = parseInt(value);
                    break; // The ball number of the player used
                case '24':
                    user['accBird'] = parseInt(value);
                    break; // The bird number of the player used
                case '25':
                    user['accDartWave'] = parseInt(value);
                    break; // The dart(wave) number of the player used
                case '26':
                    user['accRobot'] = parseInt(value);
                    break; // The robot number of the player used
                case '27':
                    user['accStreak'] = parseInt(value);
                    break; // The streak of the user
                case '28':
                    user['accGlow'] = parseInt(value);
                    break; // The glow number of the player use
                case '29':
                    user['isRegistered'] = parseInt(value);
                    break; // if an account is registered or not
                case '30':
                    user['globalRank'] = parseInt(value);
                    break; // The global rank of this player
                case '31':
                    user['friendstate'] = parseInt(value);
                    break; // 0: None, 1: already is friend, 3: send request to target, but target haven't accepted, 4: target send request, but haven't accept
                case '38':
                    user['messages'] = parseInt(value);
                    break; // How many new messages the user has (shown in-game as a notification)
                case '39':
                    user['friendRequests'] = parseInt(value);
                    break; // How many new friend requests the user has (shown in-game as a notificaiton)
                case '40':
                    user['newFriends'] = parseInt(value);
                    break; // How many new Friends the user has (shown in-game as a notificaiton)
                case '41':
                    user['newFriendRequest'] = value === '1';
                    break; // appears on userlist endpoint to show if the friend request is new
                case '42':
                    user['age'] = value;
                    break; // the time since you submitted a levelScore
                case '43':
                    user['accSpider'] = parseInt(value);
                    break; // The spider number of the player used
                case '44':
                    user['twitter'] = value;
                    break; // The twitter of player
                case '45':
                    user['twitch'] = value;
                    break; // The twitch of player
                case '46':
                    user['diamonds'] = parseInt(value);
                    break; // The count of diamonds player have
                case '48':
                    user['accExplosion'] = parseInt(value);
                    break; // The explosion number of the player use
                case '49':
                    user['modlevel'] = parseInt(value);
                    break; // 0: None, 1: Normal Mod(yellow), 2: Elder Mod(orange)
                case '50':
                    user['commentHistoryState'] = parseInt(value);
                    break; // 0: All, 1: Only friends, 2: None
            }
        }

        return user;
    });

    return users;
}

function getLevelLength(level) {
    switch (level) {
        case 1:
            return "Tiny";
        case 2:
            return "Short";
        case 3:
            return "Long";
        case 4:
            return "XL";
        case 5:
            return "Platformer";
        default:
            return "unknown"; // Or handle invalid input as needed
    }
}

module.exports = {decodeGJLevel21Response, decodeGJUser20Response, getGJUsers20, getGJLevels21, getLevelLength}