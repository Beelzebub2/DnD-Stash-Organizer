// DOM initialization
let currentConfig = {
    inventoryRegion: {
        x: 100,
        y: 100,
        width: 600,
        height: 400
    },
    debugMode: true
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initRegionCapture();
    initStatus();
    initImages();
    loadConfig();
});

// Theme management
function initTheme() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const body = document.body;

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    body.classList.remove('dark-mode', 'light-mode');
    body.classList.add(savedTheme === 'dark' ? 'dark-mode' : 'light-mode');
    themeSwitcher.checked = savedTheme === 'dark';

    // Theme switch handler
    themeSwitcher.addEventListener('change', function () {
        const isDark = this.checked;
        body.classList.remove('dark-mode', 'light-mode');
        body.classList.add(isDark ? 'dark-mode' : 'light-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// Load config from main process
async function loadConfig() {
    try {
        const response = await window.electronAPI.getConfig();
        if (response.status === 'success') {
            currentConfig = response.data;
            updateRegionPreview(currentConfig.inventoryRegion);
            console.log('Configuration loaded', currentConfig);
        } else {
            console.error('Error loading configuration:', response.message);
            showError('Error loading configuration');
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showError('Failed to load configuration');
    }
}

// Initialize images with placeholders
function initImages() {
    ['original-image', 'annotated-image', 'optimized-image'].forEach(id => {
        const img = document.getElementById(id);
        if (img) {
            const placeholderPath = '../../assets/placeholder.png';
            img.src = placeholderPath;
            console.log(`Setting placeholder for ${id}: ${placeholderPath}`);

            img.onerror = function () {
                console.error(`Failed to load image: ${this.src}`);
                this.src = placeholderPath;
            };
        }
    });
}

// Region capture management
function initRegionCapture() {
    const elements = {
        xPosition: document.getElementById('x-position'),
        yPosition: document.getElementById('y-position'),
        width: document.getElementById('width'),
        height: document.getElementById('height'),
        regionBox: document.getElementById('region-box'),
        captureBtn: document.getElementById('capture-btn'),
        loading: document.getElementById('loading')
    };

    // Validate all elements exist
    if (Object.values(elements).some(el => !el)) {
        console.error('Missing required elements for region capture');
        return;
    }

    function updateRegionPreview(values = null) {
        if (!values) {
            values = {
                x: parseInt(elements.xPosition.value),
                y: parseInt(elements.yPosition.value),
                width: parseInt(elements.width.value),
                height: parseInt(elements.height.value)
            };
        } else {
            // Update slider values from provided values
            elements.xPosition.value = values.x;
            elements.yPosition.value = values.y;
            elements.width.value = values.width;
            elements.height.value = values.height;
        }

        // Update region box visual position and size
        elements.regionBox.style.left = `${(values.x / 1920) * 100}%`;
        elements.regionBox.style.top = `${(values.y / 1080) * 100}%`;
        elements.regionBox.style.width = `${(values.width / 1920) * 100}%`;
        elements.regionBox.style.height = `${(values.height / 1080) * 100}%`;

        // Update value displays
        document.getElementById('x-position-value').textContent = values.x;
        document.getElementById('y-position-value').textContent = values.y;
        document.getElementById('width-value').textContent = values.width;
        document.getElementById('height-value').textContent = values.height;

        // Save settings
        currentConfig.inventoryRegion = values;
        localStorage.setItem('captureRegion', JSON.stringify(values));
        window.electronAPI.updateConfig(currentConfig);

        return values;
    }

    // Add event listeners for sliders
    Object.values(elements).forEach(element => {
        if (element.type === 'range') {
            element.addEventListener('input', () => updateRegionPreview());
        }
    });

    // Make region box draggable
    let isDragging = false;
    let startX, startY, originalX, originalY;

    elements.regionBox.addEventListener('mousedown', function (e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        originalX = parseInt(elements.xPosition.value);
        originalY = parseInt(elements.yPosition.value);
        this.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const previewRect = document.querySelector('.region-preview').getBoundingClientRect();
        const scaleX = 1920 / previewRect.width;
        const scaleY = 1080 / previewRect.height;

        elements.xPosition.value = Math.max(0, Math.min(1920 - parseInt(elements.width.value),
            originalX + deltaX * scaleX));
        elements.yPosition.value = Math.max(0, Math.min(1080 - parseInt(elements.height.value),
            originalY + deltaY * scaleY));

        updateRegionPreview();
    });

    document.addEventListener('mouseup', function () {
        if (isDragging) {
            isDragging = false;
            elements.regionBox.style.cursor = 'move';
        }
    });

    // Initialize the preview with saved or default values
    const savedRegion = JSON.parse(localStorage.getItem('captureRegion') || '{"x":100,"y":100,"width":600,"height":400}');
    updateRegionPreview(savedRegion);

    // Capture button functionality
    elements.captureBtn.addEventListener('click', async () => {
        try {
            elements.loading?.classList.remove('d-none');
            elements.captureBtn.disabled = true;

            const region = updateRegionPreview();
            console.log("Capturing with region:", region);

            const result = await window.electronAPI.captureScreen(region);
            console.log("Capture result:", result);

            if (result.status === 'success') {
                updateImages(result.data);
            } else {
                showError(`Capture failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Capture failed:', error);
            showError('Capture failed: ' + error.message);
        } finally {
            elements.loading?.classList.add('d-none');
            elements.captureBtn.disabled = false;
        }
    });
}

// Update images after capture
function updateImages(result) {
    console.log("Updating images with result:", result);

    const images = {
        'original-image': result.original,
        'annotated-image': result.annotated,
        'optimized-image': result.optimized
    };

    Object.entries(images).forEach(([id, src]) => {
        const img = document.getElementById(id);
        if (img && src) {
            console.log(`Setting ${id} to ${src}`);
            img.src = src;
            img.onerror = function () {
                console.error(`Failed to load image: ${this.src}`);
                this.src = '../../assets/placeholder.png';
            };
        }
    });

    // Update items list if available
    const itemsList = document.getElementById('items-list');
    if (itemsList && result.items) {
        itemsList.innerHTML = result.items && result.items.length > 0
            ? result.items.map(item => `
                <div class="items-list-item">
                    <span class="material-icons me-2">${item.type === 'weapon' ? 'gavel' : 'shield'}</span>
                    ${item.name}
                </div>`).join('')
            : '<p>No items detected in this capture.</p>';
    } else if (itemsList) {
        itemsList.innerHTML = '<p>No items detected in this capture.</p>';
    }
}

// Status management
function initStatus() {
    const statusElement = document.getElementById('server-status');
    if (!statusElement) return;

    function updateStatus(isOnline) {
        console.log(`Updating status: ${isOnline ? 'online' : 'offline'}`);
        statusElement.className = isOnline ? 'status-online' : 'status-offline';
        const statusText = statusElement.querySelector('span:last-child');
        if (statusText) {
            statusText.textContent = `Status: ${isOnline ? 'Online' : 'Offline'}`;
        }
    }

    // Listen for status updates from main process
    window.electronAPI.onStatusUpdate((event, data) => {
        console.log("Status update received:", data);
        updateStatus(data.isOnline);
    });

    // Set initial status
    updateStatus(true);
}

// Error handling
function showError(message) {
    console.error(message);
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        <strong>Error:</strong> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    const cardBody = document.querySelector('.card-body');
    if (cardBody) {
        cardBody.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
        e.preventDefault();
        const captureBtn = document.getElementById('capture-btn');
        if (captureBtn && !captureBtn.disabled) {
            captureBtn.click();
        }
    }
});