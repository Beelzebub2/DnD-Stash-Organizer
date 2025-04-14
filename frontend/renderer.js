const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// DOM Elements
const serverStatus = document.getElementById('server-status');
const captureBtn = document.getElementById('capture-btn');
const loadingSpinner = document.getElementById('loading');
const originalImage = document.getElementById('original-image');
const annotatedImage = document.getElementById('annotated-image');
const optimizedImage = document.getElementById('optimized-image');
const itemsList = document.getElementById('items-list');
const resultsList = document.getElementById('results-list');
const selectedResult = document.getElementById('selected-result');
const captureKeyInput = document.getElementById('capture-key');
const debugModeCheckbox = document.getElementById('debug-mode');
const calibrateBtn = document.getElementById('calibrate-btn');
const saveAnalyzerSettingsBtn = document.getElementById('save-analyzer-settings-btn');

// Current results
let currentResults = null;
let allResults = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Update status to online since we're now fully in Electron
    updateServerStatus(true);

    // Get config
    ipcRenderer.send('get-config');

    // Get past results
    ipcRenderer.send('get-results');
});

// Event listeners
captureBtn.addEventListener('click', () => {
    captureScreen();
});

saveAnalyzerSettingsBtn.addEventListener('click', () => {
    saveAnalyzerSettings();
});

calibrateBtn.addEventListener('click', () => {
    calibrateInventoryRegion();
});

// Update server status UI (always online in Electron-only version)
function updateServerStatus(isOnline) {
    if (isOnline) {
        serverStatus.textContent = 'Status: Ready';
        serverStatus.classList.remove('status-offline');
        serverStatus.classList.add('status-online');
        captureBtn.disabled = false;
    } else {
        serverStatus.textContent = 'Status: Error';
        serverStatus.classList.remove('status-online');
        serverStatus.classList.add('status-offline');
        captureBtn.disabled = true;
    }
}

// IPC Listeners
ipcRenderer.on('capture-result', (event, data) => {
    loadingSpinner.classList.add('d-none');

    if (data.status === 'success') {
        currentResults = data.data;
        displayResults(currentResults);

        // Refresh results list
        ipcRenderer.send('get-results');
    } else {
        alert('Error: ' + (data.message || 'Failed to capture and analyze screen'));
    }
});

ipcRenderer.on('config-result', (event, data) => {
    if (data.status === 'success') {
        const config = data.data;
        captureKeyInput.value = config.captureKey || 'f12';
        debugModeCheckbox.checked = config.debugMode || false;
    }
});

ipcRenderer.on('config-update-result', (event, data) => {
    if (data.status === 'success') {
        alert('Settings saved successfully');
    } else {
        alert('Error saving settings: ' + (data.message || 'Unknown error'));
    }
});

ipcRenderer.on('calibrate-result', (event, data) => {
    if (data.status === 'success') {
        alert('Calibration completed successfully');
    } else {
        alert('Calibration error: ' + (data.message || 'Unknown error'));
    }
});

ipcRenderer.on('results-data', (event, data) => {
    if (data.status === 'success') {
        allResults = data.data || [];
        displayResultsList(allResults);
    }
});

// Functions
function captureScreen() {
    loadingSpinner.classList.remove('d-none');
    ipcRenderer.send('capture-screen');
}

function saveAnalyzerSettings() {
    const config = {
        captureKey: captureKeyInput.value.trim(),
        debugMode: debugModeCheckbox.checked
    };

    ipcRenderer.send('update-config', config);
}

function calibrateInventoryRegion() {
    ipcRenderer.send('calibrate');
}

function displayResults(results) {
    if (!results) return;

    // Set image sources with cache-busting timestamp
    const timestamp = Date.now();
    originalImage.src = `file://${results.original}?${timestamp}`;
    annotatedImage.src = `file://${results.annotated}?${timestamp}`;
    optimizedImage.src = `file://${results.optimized}?${timestamp}`;

    // Load results JSON
    try {
        const jsonData = JSON.parse(fs.readFileSync(results.results, 'utf8'));
        displayItemsList(jsonData.slots);
    } catch (error) {
        console.error('Error reading results file:', error);
        itemsList.innerHTML = '<p>Error loading results data</p>';
    }
}

function displayItemsList(slots) {
    if (!slots || slots.length === 0) {
        itemsList.innerHTML = '<p>No items detected</p>';
        return;
    }

    let html = '<table class="table table-dark table-striped">';
    html += '<thead><tr><th>Item</th><th>Size</th><th>Position</th></tr></thead><tbody>';

    slots.forEach((slot, index) => {
        html += `<tr>
            <td>Item ${index + 1}</td>
            <td>${slot.size[0]}x${slot.size[1]}</td>
            <td>(${slot.position[0]}, ${slot.position[1]})</td>
        </tr>`;
    });

    html += '</tbody></table>';
    itemsList.innerHTML = html;
}

function displayResultsList(results) {
    if (!results || results.length === 0) {
        resultsList.innerHTML = '<p>No past results found</p>';
        return;
    }

    let html = '';

    results.forEach((result) => {
        const timestamp = new Date(parseInt(result.timestamp)).toLocaleString();
        const itemCount = result.data.slots ? result.data.slots.length : 0;

        html += `<div class="results-item" data-timestamp="${result.timestamp}">
            <div class="d-flex justify-content-between">
                <strong>${timestamp}</strong>
                <span>${itemCount} items</span>
            </div>
        </div>`;
    });

    resultsList.innerHTML = html;

    // Add click event listeners
    document.querySelectorAll('.results-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.results-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            const timestamp = item.getAttribute('data-timestamp');
            displayHistoricalResult(timestamp);
        });
    });
}

function displayHistoricalResult(timestamp) {
    const result = allResults.find(r => r.timestamp === timestamp);
    if (!result) return;

    let html = '';

    // Display time
    const date = new Date(parseInt(timestamp)).toLocaleString();
    html += `<h5>Capture from ${date}</h5>`;

    // Display images
    const originalPath = path.join(__dirname, 'captures', `capture_${timestamp}.png`);
    const optimizedPath = path.join(__dirname, 'captures', `optimized_${timestamp}.png`);

    html += `<div class="row">
        <div class="col-md-6">
            <h6>Original Capture</h6>
            <img src="file://${originalPath}" alt="Original" class="img-fluid mb-3">
        </div>
        <div class="col-md-6">
            <h6>Optimized Layout</h6>
            <img src="file://${optimizedPath}" alt="Optimized" class="img-fluid mb-3">
        </div>
    </div>`;

    // Display items
    if (result.data && result.data.slots) {
        html += '<h6>Detected Items</h6>';
        html += '<table class="table table-dark table-striped">';
        html += '<thead><tr><th>Item</th><th>Size</th></tr></thead><tbody>';

        result.data.slots.forEach((slot, index) => {
            html += `<tr>
                <td>Item ${index + 1}</td>
                <td>${slot.size[0]}x${slot.size[1]}</td>
            </tr>`;
        });

        html += '</tbody></table>';
    }

    selectedResult.innerHTML = html;
}

// Background key listener for F12
document.addEventListener('keydown', (event) => {
    if (event.key === 'F12' && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        captureScreen();
    }
});