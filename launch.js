// launch.js - Script to handle bot launching with or without setup
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logConsole = require('./logger');
const opener = require('opener');

// Configuration paths
const CONFIG_PATHS = {
    auth: path.join(__dirname, 'auth-config.json'),
    modes: path.join(__dirname, 'modes.json'),
    limits: path.join(__dirname, 'limits.json')
};

// Default minimal configurations
const DEFAULT_CONFIGS = {
    auth: {
        botUsername: "",
        botToken: "",
        channel: "",
        WebAPIToken: crypto.randomBytes(32).toString('hex'),
        ExpressSession: crypto.randomBytes(32).toString('hex')
    },
    modes: {
        gd: true,
        sub: false,
        smart: false
    },
    limits: {
        viewerRequestLimit: 1,
        subscriberRequestLimit: 5
    }
};

/**
 * Check if first-time setup is needed
 * @returns {boolean} True if setup is needed
 */
function isSetupNeeded() {
    // Check if required config files exist
    for (const [key, filePath] of Object.entries(CONFIG_PATHS)) {
        if (!fs.existsSync(filePath)) {
            return true;
        }

        // Check if auth-config has minimal required fields
        if (key === 'auth') {
            try {
                const authConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (!authConfig.botUsername || !authConfig.botToken || !authConfig.channel || !authConfig.WebAPIToken) {
                    return true;
                }
            } catch (error) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Create minimal config files to bootstrap the setup wizard
 */
function createMinimalConfigs() {
    for (const [key, filePath] of Object.entries(CONFIG_PATHS)) {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(DEFAULT_CONFIGS[key], null, 2));
            logConsole(`Created minimal ${key} configuration file`);
        }
    }
}

/**
 * Start the setup wizard
 */
function startSetupWizard() {
    logConsole('Starting GD-LevelReqBot setup wizard...');

    // Create minimal configuration files to bootstrap the wizard
    createMinimalConfigs();

    // Start the setup process
    const setupProcess = spawn('node', ['setup.js'], {
        stdio: 'inherit',
        detached: false
    });

    setupProcess.on('error', (error) => {
        logConsole(`Error starting setup wizard: ${error.message}`);
        process.exit(1);
    });

    setupProcess.on('close', (code) => {
        if (code === 0) {
            logConsole('Setup completed successfully. Starting main application...');
            startMainApplication();
        } else {
            logConsole(`Setup process exited with code ${code}`);
            process.exit(code);
        }
    });
}

/**
 * Start the main application
 */
function startMainApplication() {
    logConsole('Starting GD-LevelReqBot main application...');

    const mainProcess = spawn('node', ['main.js'], {
        stdio: 'inherit',
        detached: false
    });

    mainProcess.on('error', (error) => {
        logConsole(`Error starting main application: ${error.message}`);
        process.exit(1);
    });

    mainProcess.on('close', (code) => {
        logConsole(`Main application exited with code ${code}`);
        process.exit(code);
    });
}

/**
 * Main entry point
 */
function main() {
    if (isSetupNeeded()) {
        startSetupWizard();
    } else {
        startMainApplication();
    }
}

// Run the main function
main();