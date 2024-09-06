const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const AdmZip = require('adm-zip');
const pkg = require('../package.json');
const botConfig = require('../auth-config.json');
const axios = require('axios');
const logConsole = require("../logger");
const {exec} = require('child_process');
const {promisify} = require('util');
const which = promisify(require('which'));
const util = require('util');
const execPromise = util.promisify(exec);

// Paths
const zipPath = './latest-code.zip';
const tempExtractPath = './temp-extract';
const mainPath = './';

// Function to get version and name from package.json
function getVersionAndName() {
    try {
        const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
        return {
            version: packageJson.version || 'NF',
            name: packageJson.name || 'NF'
        };
    } catch (error) {
        return {version: 'NF', name: 'NF'};
    }
}

// Function to create a backup of the current code

function createBackup(version, name) {
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
    const backupDir = path.join('./backups', date);
    fse.ensureDirSync(backupDir);

    const backupPath = path.join(backupDir, `${version}.${name}-${time}.zip`);
    const zip = new AdmZip();

    // Add files to the zip
    zip.addLocalFolder(mainPath);
    zip.writeZip(backupPath);

    // Check if backup was created
    if (fs.existsSync(backupPath)) {
        console.log(`Backup created successfully at ${backupPath}`);
    } else {
        console.error(`Failed to create backup at ${backupPath}`);
    }
}

// Function to download the latest code
async function downloadLatestCode(url, path) {
    const writer = fs.createWriteStream(path);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Function to extract the downloaded zip file
function extractZip(path, extractTo) {
    const zip = new AdmZip(path);
    zip.extractAllTo(extractTo, true);
    console.log('Extraction complete');
}

// Function to move extracted files to the main folder
async function moveExtractedFiles(tempPath, destPath) {
    const extractedFiles = fs.readdirSync(tempPath);
    if (extractedFiles.length !== 1) {
        throw new Error('Unexpected content in the extracted folder');
    }

    const extractedFolder = path.join(tempPath, extractedFiles[0]);
    if (!fs.lstatSync(extractedFolder).isDirectory()) {
        throw new Error('Extracted content is not a directory');
    }

    // Move the contents of the extracted folder to the main folder
    await fse.copy(extractedFolder, destPath, {overwrite: true});
    console.log('Files moved to the main folder');

    // Clean up the temporary extraction folder
    fse.removeSync(tempPath);
}

// Function to restart the application using pm2
function restartWithPM2() {
    console.log('Restarting application with pm2...');
    exec('pm2 restart main.js', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error restarting application with pm2: ${error.message}`);
            return;
        }

        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }

        console.log(`stdout: ${stdout}`);
    });
}

// Function to restart the application using npm
function restartWithNPM() {
    console.log('Restarting application with npm...');
    exec('npm restart', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error restarting application with npm: ${error.message}`);
            return;
        }

        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }

        console.log(`stdout: ${stdout}`);
    });
}

// Main function to update the application
async function updateApplication(serverVersion) {
    logConsole('Starting application update...');

    try {
        const {version, name} = getVersionAndName();
        logConsole(`Backing up current version: ${version}, ${name}`);
        createBackup(version, name);

        const githubReleaseUrl = `https://github.com/Supernova3339/gd-levelreqbot/archive/refs/tags/${serverVersion}.zip`;
        logConsole(`Downloading latest code from ${githubReleaseUrl}`);
        await downloadLatestCode(githubReleaseUrl, zipPath);
        logConsole('Download complete.');

        logConsole('Extracting downloaded code...');
        extractZip(zipPath, tempExtractPath);
        logConsole('Extraction complete.');

        logConsole('Moving extracted files to the main directory...');
        await moveExtractedFiles(tempExtractPath, mainPath);
        logConsole('Files moved successfully.');

        logConsole('Cleaning up...');
        fs.unlinkSync(zipPath);
        logConsole('Cleanup complete.');

        // Attempt to stop PM2 process if PM2 is found
        logConsole('Checking for PM2...');
        try {
            await execPromise('pm2 --version'); // Check if PM2 is installed

            logConsole('PM2 found. Attempting to stop application with PM2... Please manually restart the application upon completion.');
            exec('pm2 stop main', (error, stdout, stderr) => {
                if (error) {
                    logConsole(`Error stopping application with PM2: ${error.message}`);
                }
                if (stderr) {
                    logConsole(`PM2 stderr (stop): ${stderr}`);
                }
                logConsole(`PM2 stdout (stop): ${stdout}`);

                logConsole('Restarting application with PM2...');
                exec('pm2 restart main', (error, stdout, stderr) => {
                    if (error) {
                        logConsole(`Error restarting application with PM2: ${error.message}`);
                    }
                    if (stderr) {
                        logConsole(`PM2 stderr (restart): ${stderr}`);
                    }
                    logConsole(`PM2 stdout (restart): ${stdout}`);
                    logConsole('Bot restarted successfully with PM2.');
                });
            });
        } catch (pm2Error) {
            logConsole('PM2 not found. Attempting to kill all PM2 processes.');

            // Attempt to kill all PM2 processes
            exec('pm2 kill', (error, stdout, stderr) => {
                if (error) {
                    logConsole(`Error executing 'pm2 kill': ${error.message}`);
                }
                if (stderr) {
                    logConsole(`PM2 stderr (kill): ${stderr}`);
                }
                logConsole(`PM2 stdout (kill): ${stdout}`);
                logConsole('Attempted to kill PM2 processes.');
                // Exit gracefully if PM2 is not found
                process.exit(0);
            });
        }

    } catch (error) {
        logConsole(`Update process encountered an error: ${error.message}`);
        throw error; // Ensure the error propagates up
    }
}

async function checkForUpdates(client, isTwitch) {
    // URL of update server
    const url = 'https://dl.supers0ft.us/gdlvlreqbot/';

    logConsole('Starting update check...');

    try {
        logConsole('Fetching remote version...');
        // Get the remote version
        const response = await axios.get(url);
        const serverVersion = response.data.trim();

        logConsole(`Remote version fetched: ${serverVersion}`);

        // Local version
        const localVersion = pkg.version;

        logConsole(`Local version: ${localVersion}`);

        // Compare versions
        if (localVersion !== serverVersion) {
            logConsole(`New version ${serverVersion} is available. Please update to continue using the bot.`);

            if (isTwitch) {
                logConsole('Sending update notification to Twitch channel...');
                await client.say(botConfig.channel, 'New version available. Please update to continue using the bot.');
                logConsole('Notification sent.');
            }

            logConsole('Checking for PM2...');
            try {
                await execPromise('pm2 --version'); // Check if PM2 is available
                logConsole('PM2 found..');


                // Start the update process after verifying PM2 exists
                updateApplication(serverVersion)
                    .then(() => logConsole('Update process completed successfully.'))
                    .catch(updateError => logConsole(`Error during update: ${updateError.message}`));

            } catch (pm2Error) {
                logConsole('PM2 not found. Proceeding with update directly.');
                // Proceed with update if PM2 is not found
                updateApplication(serverVersion)
                    .then(() => logConsole('Update process completed successfully.'))
                    .catch(updateError => logConsole(`Error during update: ${updateError.message}`));
            }
        } else {
            logConsole('User has the latest version. No update needed.');
            return('User has the latest version. No update needed.');
        }
    } catch (error) {
        logConsole(`Error checking for updates: ${error.message}`);
        return(`Error checking for updates: ${error.message}`);
    }
}


module.exports = checkForUpdates;
