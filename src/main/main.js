const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { InventoryAnalyzer } = require('./screen-capture');

let mainWindow;
let analyzer;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload.js')
        },
        icon: path.join(__dirname, '../../assets/logo.png')
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Initialize analyzer
    analyzer = new InventoryAnalyzer();

    // Send initial status
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('status-update', { isOnline: true });
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Handlers
ipcMain.handle('capture-screen', async (event, region) => {
    try {
        const timestamp = Date.now();
        const capturesDir = path.join(__dirname, '../../captures');

        if (!fs.existsSync(capturesDir)) {
            fs.mkdirSync(capturesDir, { recursive: true });
        }

        console.log('Capturing screen with region:', region);
        const result = await analyzer.captureAndAnalyze();
        console.log('Capture result:', result);

        return {
            status: 'success',
            data: result
        };
    } catch (error) {
        console.error('Screen capture failed:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
});

// Load config
ipcMain.handle('get-config', async (event) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        let config;

        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
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

        return {
            status: 'success',
            data: config
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message
        };
    }
});

// Update config
ipcMain.handle('update-config', async (event, newConfig) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        analyzer.config = { ...analyzer.config, ...newConfig };
        return {
            status: 'success',
            data: newConfig
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message
        };
    }
});

// Get previous results
ipcMain.handle('get-results', async () => {
    try {
        const capturesDir = path.join(__dirname, '../../captures');
        const results = [];

        if (fs.existsSync(capturesDir)) {
            const files = fs.readdirSync(capturesDir);
            const resultFiles = files.filter(file => file.startsWith('results_') && file.endsWith('.json'));

            resultFiles.forEach(file => {
                const filePath = path.join(capturesDir, file);
                const timestamp = file.replace('results_', '').replace('.json', '');
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    results.push({
                        timestamp,
                        data
                    });
                } catch (err) {
                    console.error(`Error reading file ${filePath}:`, err);
                }
            });
        }

        return {
            status: 'success',
            data: results.sort((a, b) => b.timestamp - a.timestamp)
        };
    } catch (error) {
        return {
            status: 'error',
            message: error.message
        };
    }
});