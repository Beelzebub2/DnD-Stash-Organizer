const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// DOM Elements
let captureBtn;
let resultDisplay;
let configForm;
let xSlider, ySlider, widthSlider, heightSlider;
let xValue, yValue, widthValue, heightValue;
let debugModeToggle;
let loadingIndicator;

// Config
let currentConfig = {
    inventoryRegion: {
        x: 100,
        y: 100,
        width: 600,
        height: 400
    },
    debugMode: true
};

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadConfig();
    loadPreviousResults();
});

function initUI() {
    // Get DOM elements
    captureBtn = document.getElementById('capture-btn');
    resultDisplay = document.getElementById('result-display');
    configForm = document.getElementById('config-form');
    xSlider = document.getElementById('region-x');
    ySlider = document.getElementById('region-y');
    widthSlider = document.getElementById('region-width');
    heightSlider = document.getElementById('region-height');
    xValue = document.getElementById('x-value');
    yValue = document.getElementById('y-value');
    widthValue = document.getElementById('width-value');
    heightValue = document.getElementById('height-value');
    debugModeToggle = document.getElementById('debug-mode');
    loadingIndicator = document.getElementById('loading-indicator');

    // Set up event listeners
    captureBtn.addEventListener('click', captureScreen);

    xSlider.addEventListener('input', updateConfigFromSliders);
    ySlider.addEventListener('input', updateConfigFromSliders);
    widthSlider.addEventListener('input', updateConfigFromSliders);
    heightSlider.addEventListener('input', updateConfigFromSliders);

    debugModeToggle.addEventListener('change', () => {
        currentConfig.debugMode = debugModeToggle.checked;
        updateConfig();
    });

    // Initialize tooltips
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(tooltipTriggerEl => {
        new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Theme switching functionality
    const themeSwitcher = document.getElementById('theme-switcher');
    const body = document.body;

    // Load saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    body.classList.toggle('light-mode', savedTheme === 'light');
    body.classList.toggle('dark-mode', savedTheme === 'dark');
    themeSwitcher.checked = savedTheme === 'dark';

    themeSwitcher.addEventListener('change', function () {
        const isDark = this.checked;
        body.classList.toggle('light-mode', !isDark);
        body.classList.toggle('dark-mode', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    // Capture region functionality
    const xPosition = document.getElementById('x-position');
    const yPosition = document.getElementById('y-position');
    const width = document.getElementById('width');
    const height = document.getElementById('height');
    const regionBox = document.getElementById('region-box');

    // Load saved region settings
    const savedRegion = JSON.parse(localStorage.getItem('captureRegion') || '{"x": 100, "y": 100, "width": 600, "height": 400}');
    xPosition.value = savedRegion.x;
    yPosition.value = savedRegion.y;
    width.value = savedRegion.width;
    height.value = savedRegion.height;

    // Update region preview and values
    function updateRegionPreview() {
        const x = parseInt(xPosition.value);
        const y = parseInt(yPosition.value);
        const w = parseInt(width.value);
        const h = parseInt(height.value);

        // Update region box position and size
        regionBox.style.left = `${(x / 1920) * 100}%`;
        regionBox.style.top = `${(y / 1080) * 100}%`;
        regionBox.style.width = `${(w / 1920) * 100}%`;
        regionBox.style.height = `${(h / 1080) * 100}%`;

        // Update value displays
        document.getElementById('x-position-value').textContent = x;
        document.getElementById('y-position-value').textContent = y;
        document.getElementById('width-value').textContent = w;
        document.getElementById('height-value').textContent = h;

        // Save settings
        localStorage.setItem('captureRegion', JSON.stringify({ x, y, width: w, height: h }));
    }

    // Initialize region preview
    updateRegionPreview();

    // Add event listeners for sliders
    [xPosition, yPosition, width, height].forEach(slider => {
        slider.addEventListener('input', updateRegionPreview);
    });

    // Make region box draggable
    let isDragging = false;
    let startX, startY;
    let originalX, originalY;

    regionBox.addEventListener('mousedown', function (e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        originalX = parseInt(xPosition.value);
        originalY = parseInt(yPosition.value);

        regionBox.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const previewRect = document.querySelector('.region-preview').getBoundingClientRect();
        const scaleX = 1920 / previewRect.width;
        const scaleY = 1080 / previewRect.height;

        const newX = Math.max(0, Math.min(1920 - parseInt(width.value), originalX + deltaX * scaleX));
        const newY = Math.max(0, Math.min(1080 - parseInt(height.value), originalY + deltaY * scaleY));

        xPosition.value = Math.round(newX);
        yPosition.value = Math.round(newY);
        updateRegionPreview();
    });

    document.addEventListener('mouseup', function () {
        if (isDragging) {
            isDragging = false;
            regionBox.style.cursor = 'move';
        }
    });

    // Capture functionality
    captureBtn.addEventListener('click', async function () {
        const region = {
            x: parseInt(xPosition.value),
            y: parseInt(yPosition.value),
            width: parseInt(width.value),
            height: parseInt(height.value)
        };

        try {
            loadingIndicator.classList.remove('d-none');
            captureBtn.disabled = true;

            // Send capture request to main process
            const result = await window.electronAPI.captureScreen(region);

            // Update images with results
            document.getElementById('original-image').src = result.originalImage;
            document.getElementById('annotated-image').src = result.annotatedImage;
            document.getElementById('optimized-image').src = result.optimizedImage;

            // Update items list
            const itemsList = document.getElementById('items-list');
            if (result.items && result.items.length > 0) {
                itemsList.innerHTML = result.items
                    .map(item => `<div class="items-list-item">
                        <span class="material-icons me-2">${item.type === 'weapon' ? 'gavel' : 'shield'}</span>
                        ${item.name}
                    </div>`)
                    .join('');
            } else {
                itemsList.innerHTML = '<p>No items detected in this capture.</p>';
            }
        } catch (error) {
            console.error('Capture failed:', error);
            // Show error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger mt-3';
            errorDiv.innerHTML = `<span class="material-icons me-2">error</span> Capture failed: ${error.message}`;
            document.querySelector('.card-body').appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        } finally {
            loadingIndicator.classList.add('d-none');
            captureBtn.disabled = false;
        }
    });

    // Keyboard shortcut for capture
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F12') {
            e.preventDefault();
            captureBtn.click();
        }
    });
}

function updateConfigFromSliders() {
    // Update values display
    xValue.textContent = xSlider.value;
    yValue.textContent = ySlider.value;
    widthValue.textContent = widthSlider.value;
    heightValue.textContent = heightSlider.value;

    // Update config
    currentConfig.inventoryRegion = {
        x: parseInt(xSlider.value),
        y: parseInt(ySlider.value),
        width: parseInt(widthSlider.value),
        height: parseInt(heightSlider.value)
    };

    updateConfig();
}

function updateSlidersFromConfig() {
    // Update slider values
    xSlider.value = currentConfig.inventoryRegion.x;
    ySlider.value = currentConfig.inventoryRegion.y;
    widthSlider.value = currentConfig.inventoryRegion.width;
    heightSlider.value = currentConfig.inventoryRegion.height;

    // Update display values
    xValue.textContent = currentConfig.inventoryRegion.x;
    yValue.textContent = currentConfig.inventoryRegion.y;
    widthValue.textContent = currentConfig.inventoryRegion.width;
    heightValue.textContent = currentConfig.inventoryRegion.height;

    // Update debug mode toggle
    debugModeToggle.checked = currentConfig.debugMode;
}

function loadConfig() {
    ipcRenderer.send('get-config');

    ipcRenderer.once('config-result', (event, response) => {
        if (response.status === 'success') {
            currentConfig = response.data;
            updateSlidersFromConfig();
            console.log('Configuration loaded', currentConfig);
        } else {
            console.error('Error loading configuration:', response.message);
            showNotification('Error loading configuration', 'danger');
        }
    });
}

function updateConfig() {
    ipcRenderer.send('update-config', currentConfig);

    ipcRenderer.once('config-update-result', (event, response) => {
        if (response.status === 'success') {
            console.log('Configuration updated', response.data);
        } else {
            console.error('Error updating configuration:', response.message);
            showNotification('Error updating configuration', 'danger');
        }
    });
}

function captureScreen() {
    // Show loading indicator
    loadingIndicator.style.display = 'block';
    captureBtn.disabled = true;

    // Clear previous results
    resultDisplay.innerHTML = '';

    ipcRenderer.send('capture-screen');

    ipcRenderer.once('capture-result', (event, response) => {
        // Hide loading indicator
        loadingIndicator.style.display = 'none';
        captureBtn.disabled = false;

        if (response.status === 'success') {
            const result = response.data;
            displayResults(result);
            console.log('Capture successful', result);
        } else {
            console.error('Error capturing screen:', response.message);
            showNotification('Error capturing screen: ' + response.message, 'danger');
        }

        // Reload results list after capture
        loadPreviousResults();
    });
}

function displayResults(result) {
    const { original, annotated, optimized } = result;

    const resultHtml = `
        <div class="row mb-4">
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">Original Capture</div>
                    <div class="card-body p-0">
                        <img src="${original.replace(/\\/g, '/')}" class="img-fluid" alt="Original Inventory">
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">Detected Slots</div>
                    <div class="card-body p-0">
                        <img src="${annotated.replace(/\\/g, '/')}" class="img-fluid" alt="Detected Slots">
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">Optimized Layout</div>
                    <div class="card-body p-0">
                        <img src="${optimized.replace(/\\/g, '/')}" class="img-fluid" alt="Optimized Layout">
                    </div>
                </div>
            </div>
        </div>
    `;

    resultDisplay.innerHTML = resultHtml;
    showNotification('Inventory analyzed successfully!', 'success');
}

function loadPreviousResults() {
    const resultsList = document.getElementById('previous-results');
    if (!resultsList) return;

    ipcRenderer.send('get-results');

    ipcRenderer.once('results-data', (event, response) => {
        if (response.status === 'success') {
            const results = response.data;

            if (results.length === 0) {
                resultsList.innerHTML = '<div class="list-group-item">No previous results found</div>';
                return;
            }

            let resultsHtml = '';

            results.forEach(result => {
                const timestamp = new Date(parseInt(result.timestamp));
                const formattedDate = timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString();
                const slotCount = result.data.slots ? result.data.slots.length : 0;

                resultsHtml += `
                    <a href="#" class="list-group-item list-group-item-action load-result" data-timestamp="${result.timestamp}">
                        <div class="d-flex w-100 justify-content-between">
                            <h5 class="mb-1">Capture ${formattedDate}</h5>
                            <small>${slotCount} slots detected</small>
                        </div>
                        <p class="mb-1">Click to view this result</p>
                    </a>
                `;
            });

            resultsList.innerHTML = resultsHtml;

            // Add event listeners to result items
            document.querySelectorAll('.load-result').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const timestamp = e.currentTarget.getAttribute('data-timestamp');
                    loadResult(timestamp, results);
                });
            });
        } else {
            console.error('Error loading previous results:', response.message);
        }
    });
}

function loadResult(timestamp, results) {
    const result = results.find(r => r.timestamp === timestamp);
    if (!result) return;

    // Format paths for display
    const baseDir = result.data.original ? result.data.original.substring(0, result.data.original.lastIndexOf('\\')) : '';

    const resultData = {
        original: `${baseDir}\\capture_${timestamp}.png`,
        annotated: `${baseDir}\\annotated_${timestamp}.png`,
        optimized: `${baseDir}\\optimized_${timestamp}.png`,
    };

    displayResults(resultData);
}

function showNotification(message, type = 'info') {
    const alertContainer = document.getElementById('alert-container');

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.setAttribute('role', 'alert');
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    alertContainer.appendChild(alert);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alert);
        bsAlert.close();
    }, 5000);
}