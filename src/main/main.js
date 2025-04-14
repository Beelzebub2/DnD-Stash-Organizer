const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { captureScreen } = require('./screen-capture');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, '../../assets/logo.png')
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC handlers
ipcMain.on('capture-screen', async (event, region) => {
    try {
        const timestamp = Date.now();
        const capturesDir = path.join(__dirname, '../../captures');

        // Ensure captures directory exists
        if (!fs.existsSync(capturesDir)) {
            fs.mkdirSync(capturesDir, { recursive: true });
        }

        // Capture and process screen
        const result = await captureScreen(region, capturesDir, timestamp);

        // Save results
        const resultsPath = path.join(capturesDir, `results_${timestamp}.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));

        event.reply('capture-result', {
            status: 'success',
            data: {
                timestamp,
                ...result
            }
        });
    } catch (error) {
        console.error('Screen capture failed:', error);
        event.reply('capture-result', {
            status: 'error',
            message: error.message
        });
    }
});

// Load config
ipcMain.on('get-config', (event) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        let config;

        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            // Default config
            config = {
                inventoryRegion: {
                    x: 100,
                    y: 100,
                    width: 600,
                    height: 400
                },
                debugMode: true
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }

        event.reply('config-result', {
            status: 'success',
            data: config
        });
    } catch (error) {
        event.reply('config-result', {
            status: 'error',
            message: error.message
        });
    }
});

// Update config
ipcMain.on('update-config', (event, newConfig) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

        event.reply('config-update-result', {
            status: 'success',
            data: newConfig
        });
    } catch (error) {
        event.reply('config-update-result', {
            status: 'error',
            message: error.message
        });
    }
});

// Get previous results
ipcMain.on('get-results', (event) => {
    try {
        const capturesDir = path.join(__dirname, '../../captures');
        const results = [];

        if (fs.existsSync(capturesDir)) {
            const files = fs.readdirSync(capturesDir);
            const resultFiles = files.filter(file => file.startsWith('results_') && file.endsWith('.json'));

            resultFiles.forEach(file => {
                const filePath = path.join(capturesDir, file);
                const timestamp = file.replace('results_', '').replace('.json', '');
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                results.push({
                    timestamp,
                    data
                });
            });
        }

        event.reply('results-data', {
            status: 'success',
            data: results.sort((a, b) => b.timestamp - a.timestamp)
        });
    } catch (error) {
        event.reply('results-data', {
            status: 'error',
            message: error.message
        });
    }
});