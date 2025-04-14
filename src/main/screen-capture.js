const fs = require('fs');
const path = require('path');
const { desktopCapturer, screen } = require('electron');
const Jimp = require('jimp');
const pixelmatch = require('pixelmatch');
const seedrandom = require('seedrandom');
const { ipcMain } = require('electron');
const sharp = require('sharp');

// Create captures directory if it doesn't exist
const outputDir = path.join(__dirname, '../../captures');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

class InventoryAnalyzer {
    constructor(configFile = 'config.json') {
        // Default configuration
        this.config = {
            captureKey: 'f12',
            inventoryRegion: {
                x: 100,
                y: 100,
                width: 600,
                height: 400
            },
            outputDir: path.join(__dirname, '../../captures'),
            slotDetectionThreshold: 0.7,
            debugMode: true,
            sampleStep: 5 // Default sample step for performance
        };

        // Load configuration if it exists
        this.loadConfig(configFile);

        // Ensure output directory exists
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }

        console.log(`Inventory Analyzer initialized with region:`, this.config.inventoryRegion);
    }

    loadConfig(configFile) {
        const configPath = path.join(__dirname, configFile);
        try {
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const loadedConfig = JSON.parse(configData);
                this.config = { ...this.config, ...loadedConfig };
                console.log(`Configuration loaded from ${configFile}`);
            }
        } catch (error) {
            console.error(`Error loading configuration: ${error.message}`);
        }
    }

    saveConfig(configFile = 'config.json') {
        const configPath = path.join(__dirname, configFile);
        try {
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
            console.log(`Configuration saved to ${configFile}`);
        } catch (error) {
            console.error(`Error saving configuration: ${error.message}`);
        }
    }

    async captureScreen() {
        try {
            console.log("Capturing screen with region:", this.config.inventoryRegion);

            // Get primary display
            const primaryDisplay = screen.getPrimaryDisplay();

            // Get all screens
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: primaryDisplay.size.width,
                    height: primaryDisplay.size.height
                }
            });

            // Get the primary screen source
            const primarySource = sources.find(source =>
                source.display_id === primaryDisplay.id.toString() ||
                source.id.includes('screen:0')
            ) || sources[0];

            if (!primarySource) {
                throw new Error('Could not find primary display');
            }

            // Get the native image from the thumbnail
            const image = primarySource.thumbnail;

            // Convert NativeImage to Buffer
            const imageBuffer = image.toPNG();

            // Use Sharp to crop and process the image
            const sharpImage = sharp(imageBuffer);

            // Log original image dimensions
            const metadata = await sharpImage.metadata();
            console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);

            // Ensure region is valid
            const region = { ...this.config.inventoryRegion }; // Clone the region object
            console.log(`Cropping to region: ${JSON.stringify(region)}`);

            // Check if region is within image bounds
            if (region.x + region.width > metadata.width ||
                region.y + region.height > metadata.height) {
                console.warn("Region extends beyond image bounds, adjusting...");
                region.width = Math.min(region.width, metadata.width - region.x);
                region.height = Math.min(region.height, metadata.height - region.y);
            }

            // Crop to the specified region
            const croppedImage = await sharpImage
                .extract({
                    left: region.x,
                    top: region.y,
                    width: region.width,
                    height: region.height
                })
                .toBuffer();

            // Generate a temporary file path
            const timestamp = Date.now();
            const outputPath = path.join(this.config.outputDir, `capture_${timestamp}.png`);

            // Save the image
            await sharp(croppedImage).toFile(outputPath);
            console.log(`Screenshot saved to ${outputPath}`);

            return outputPath;
        } catch (error) {
            console.error('Error capturing screen:', error);
            throw error;
        }
    }

    async detectInventoryGrid(imagePath) {
        try {
            const image = await Jimp.read(imagePath);

            // Convert image to grayscale
            image.greyscale();

            // Enhance contrast for better edge detection
            image.contrast(0.2);

            const width = image.getWidth();
            const height = image.getHeight();

            // Create a binary image for potential slots
            const binaryImage = new Jimp(width, height, 0xffffffff);

            // Enhanced edge detection with adaptive threshold
            const baseThreshold = 35; // Start with a slightly lower threshold

            // Calculate average brightness for adaptive thresholding
            let totalBrightness = 0;
            let pixelCount = 0;

            // Sample pixels for average brightness
            const sampleStep = this.config.sampleStep || 5; // Use configurable sample step or default to 5
            for (let y = 0; y < height; y += sampleStep) {
                for (let x = 0; x < width; x += sampleStep) {
                    const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
                    totalBrightness += pixel.r; // since it's grayscale, r = g = b
                    pixelCount++;
                }
            }

            const avgBrightness = totalBrightness / pixelCount;
            const adaptiveThreshold = baseThreshold * (1 + (avgBrightness / 255));

            console.log(`Using adaptive threshold: ${adaptiveThreshold} (avg brightness: ${avgBrightness})`);

            // Apply Sobel-like edge detection (simplified)
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    // Get surrounding pixels
                    const tl = Jimp.intToRGBA(image.getPixelColor(x - 1, y - 1)).r;
                    const t = Jimp.intToRGBA(image.getPixelColor(x, y - 1)).r;
                    const tr = Jimp.intToRGBA(image.getPixelColor(x + 1, y - 1)).r;
                    const l = Jimp.intToRGBA(image.getPixelColor(x - 1, y)).r;
                    const c = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
                    const r = Jimp.intToRGBA(image.getPixelColor(x + 1, y)).r;
                    const bl = Jimp.intToRGBA(image.getPixelColor(x - 1, y + 1)).r;
                    const b = Jimp.intToRGBA(image.getPixelColor(x, y + 1)).r;
                    const br = Jimp.intToRGBA(image.getPixelColor(x + 1, y + 1)).r;

                    // Simplified Sobel-like operators
                    const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
                    const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);

                    const gradient = Math.sqrt(gx * gx + gy * gy);

                    if (gradient > adaptiveThreshold) {
                        binaryImage.setPixelColor(0x000000ff, x, y); // Set black for edge pixels
                    }
                }
            }

            // Save the binary image if in debug mode
            if (this.config.debugMode) {
                const timestamp = Date.now();
                const debugPath = path.join(this.config.outputDir, `debug_edges_${timestamp}.png`);
                await binaryImage.writeAsync(debugPath);
            }

            // Apply a noise reduction pass
            const denoisedImage = binaryImage.clone();
            for (let y = 2; y < height - 2; y++) {
                for (let x = 2; x < width - 2; x++) {
                    const center = Jimp.intToRGBA(binaryImage.getPixelColor(x, y)).r;

                    // Only look at edge pixels (black)
                    if (center === 0) {
                        // Count black pixels in 5x5 neighborhood
                        let blackCount = 0;
                        for (let ny = -2; ny <= 2; ny++) {
                            for (let nx = -2; nx <= 2; nx++) {
                                const neighborY = y + ny;
                                const neighborX = x + nx;
                                if (neighborX >= 0 && neighborX < width && neighborY >= 0 && neighborY < height) {
                                    const neighbor = Jimp.intToRGBA(binaryImage.getPixelColor(neighborX, neighborY)).r;
                                    if (neighbor === 0) {
                                        blackCount++;
                                    }
                                }
                            }
                        }

                        // If there are too few black pixels in neighborhood, it's likely noise
                        if (blackCount < 3) {
                            denoisedImage.setPixelColor(0xffffffff, x, y); // Change to white (remove noise)
                        }
                    }
                }
            }

            // Detect rectangles (potential inventory slots)
            const contours = this.findRectangles(denoisedImage);

            // Detect grid pattern for better inventory slot detection
            const gridPattern = this.detectGridPattern(contours);

            if (this.config.debugMode) {
                // Create a debug image showing detected rectangles
                const debugImage = await Jimp.read(imagePath);

                // Draw rectangles on debug image
                for (const rect of contours) {
                    // Draw in yellow
                    const yellow = Jimp.rgbaToInt(255, 255, 0, 255);

                    // Draw rectangle border
                    for (let y = rect.y; y < rect.y + rect.height; y++) {
                        for (let x = rect.x; x < rect.x + rect.width; x++) {
                            // Only draw border pixels
                            if (
                                x === rect.x || x === rect.x + rect.width - 1 ||
                                y === rect.y || y === rect.y + rect.height - 1
                            ) {
                                if (x >= 0 && x < width && y >= 0 && y < height) {
                                    debugImage.setPixelColor(yellow, x, y);
                                }
                            }
                        }
                    }
                }

                // Highlight grid pattern in green
                if (gridPattern.cells.length > 0) {
                    const green = Jimp.rgbaToInt(0, 255, 0, 255);
                    for (const cell of gridPattern.cells) {
                        // Draw cell borders in green
                        for (let i = 0; i < cell.width; i++) {
                            if (cell.y >= 0 && cell.y < height && cell.x + i >= 0 && cell.x + i < width) {
                                debugImage.setPixelColor(green, cell.x + i, cell.y);
                            }
                            if (cell.y + cell.height - 1 >= 0 && cell.y + cell.height - 1 < height &&
                                cell.x + i >= 0 && cell.x + i < width) {
                                debugImage.setPixelColor(green, cell.x + i, cell.y + cell.height - 1);
                            }
                        }

                        for (let i = 0; i < cell.height; i++) {
                            if (cell.y + i >= 0 && cell.y + i < height && cell.x >= 0 && cell.x < width) {
                                debugImage.setPixelColor(green, cell.x, cell.y + i);
                            }
                            if (cell.y + i >= 0 && cell.y + i < height &&
                                cell.x + cell.width - 1 >= 0 && cell.x + cell.width - 1 < width) {
                                debugImage.setPixelColor(green, cell.x + cell.width - 1, cell.y + i);
                            }
                        }
                    }
                }

                const timestamp = Date.now();
                const debugPath = path.join(this.config.outputDir, `debug_rects_${timestamp}.png`);
                await debugImage.writeAsync(debugPath);
            }

            return gridPattern.cells.length > 0 ? gridPattern.cells : contours;
        } catch (error) {
            console.error('Error detecting inventory grid:', error);
            throw error;
        }
    }

    detectGridPattern(rectangles) {
        // Early return if not enough rectangles
        if (rectangles.length < 4) {
            return { cells: [] };
        }

        // Group rectangles by similar width and height
        const sizeGroups = {};

        for (const rect of rectangles) {
            // Round width and height to nearest 10 pixels for grouping
            const keyWidth = Math.round(rect.width / 10) * 10;
            const keyHeight = Math.round(rect.height / 10) * 10;
            const key = `${keyWidth}x${keyHeight}`;

            if (!sizeGroups[key]) {
                sizeGroups[key] = [];
            }

            sizeGroups[key].push(rect);
        }

        // Find the group with most rectangles - this is likely our grid
        let largestGroup = [];
        let largestGroupSize = 0;
        let largestGroupKey = '';

        for (const [key, group] of Object.entries(sizeGroups)) {
            if (group.length > largestGroupSize) {
                largestGroupSize = group.length;
                largestGroup = group;
                largestGroupKey = key;
            }
        }

        // If we don't have enough rectangles in our largest group, return all rectangles
        if (largestGroupSize < 4) {
            return { cells: rectangles };
        }

        console.log(`Detected grid pattern with ${largestGroupSize} cells of size ${largestGroupKey}`);

        // Analyze spatial distribution
        // Sort by x and y coordinates
        const sortedByX = [...largestGroup].sort((a, b) => a.x - b.x);
        const sortedByY = [...largestGroup].sort((a, b) => a.y - b.y);

        // Calculate average width and height of cells
        const [width, height] = largestGroupKey.split('x').map(Number);

        // Detect rows and columns
        const rows = [];
        const columns = [];

        let lastY = -1000;
        for (const rect of sortedByY) {
            // If this rect is far from the last row's y position, it's a new row
            if (Math.abs(rect.y - lastY) > height * 0.5) {
                rows.push([rect]);
                lastY = rect.y;
            } else {
                // Add to the last row
                rows[rows.length - 1].push(rect);
            }
        }

        let lastX = -1000;
        for (const rect of sortedByX) {
            // If this rect is far from the last column's x position, it's a new column
            if (Math.abs(rect.x - lastX) > width * 0.5) {
                columns.push([rect]);
                lastX = rect.x;
            } else {
                // Add to the last column
                columns[columns.length - 1].push(rect);
            }
        }

        console.log(`Detected approximately ${rows.length} rows and ${columns.length} columns`);

        // If we have a clear grid pattern, return the cells from the largest group
        return {
            cells: largestGroup,
            rows: rows.length,
            columns: columns.length,
            cellWidth: width,
            cellHeight: height
        };
    }

    findRectangles(binaryImage) {
        // ... existing code ...
        const width = binaryImage.getWidth();
        const height = binaryImage.getHeight();
        const visited = Array(height).fill().map(() => Array(width).fill(false));
        const rectangles = [];

        // Minimum and maximum sizes for inventory slots
        const minSize = 40; // pixels
        const maxSize = 200; // pixels

        // Loop through the image to find connected components
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = Jimp.intToRGBA(binaryImage.getPixelColor(x, y));

                // Check for black pixels (edges) that haven't been visited
                if (pixel.r === 0 && !visited[y][x]) {
                    // Found a new potential rectangle
                    const rect = {
                        x: x,
                        y: y,
                        width: 0,
                        height: 0,
                        area: 0
                    };

                    // Perform flood fill to find connected component
                    const stack = [{ x, y }];
                    let minX = x, maxX = x, minY = y, maxY = y;

                    while (stack.length > 0) {
                        const current = stack.pop();
                        const cx = current.x;
                        const cy = current.y;

                        // Check if this point is in bounds, is black, and hasn't been visited
                        if (
                            cx >= 0 && cx < width && cy >= 0 && cy < height &&
                            !visited[cy][cx] &&
                            Jimp.intToRGBA(binaryImage.getPixelColor(cx, cy)).r === 0
                        ) {
                            visited[cy][cx] = true;

                            // Update bounds of the rectangle
                            minX = Math.min(minX, cx);
                            maxX = Math.max(maxX, cx);
                            minY = Math.min(minY, cy);
                            maxY = Math.max(maxY, cy);

                            // Add neighbors to stack
                            stack.push({ x: cx + 1, y: cy });
                            stack.push({ x: cx - 1, y: cy });
                            stack.push({ x: cx, y: cy + 1 });
                            stack.push({ x: cx, y: cy - 1 });
                        }
                    }

                    // Calculate width, height and area of the rectangle
                    rect.width = maxX - minX + 1;
                    rect.height = maxY - minY + 1;
                    rect.area = rect.width * rect.height;

                    // Only consider rectangles that are within size limits and have a reasonable aspect ratio
                    if (
                        rect.width >= minSize && rect.width <= maxSize &&
                        rect.height >= minSize && rect.height <= maxSize &&
                        rect.width / rect.height >= 0.5 && rect.width / rect.height <= 2.0
                    ) {
                        rectangles.push(rect);
                    }
                }
            }
        }

        // Filter out overlapping rectangles
        return this.filterOverlappingRectangles(rectangles);
    }

    filterOverlappingRectangles(rectangles) {
        // Sort by area, largest first
        rectangles.sort((a, b) => b.area - a.area);

        const filtered = [];
        const overlapThreshold = 0.5; // Consider as overlapping if intersection area exceeds this percentage

        for (const rect of rectangles) {
            let shouldInclude = true;

            for (const existing of filtered) {
                // Calculate intersection area
                const xOverlap = Math.max(0, Math.min(rect.x + rect.width, existing.x + existing.width) - Math.max(rect.x, existing.x));
                const yOverlap = Math.max(0, Math.min(rect.y + rect.height, existing.y + existing.height) - Math.max(rect.y, existing.y));
                const overlapArea = xOverlap * yOverlap;

                // Calculate overlap ratio relative to the current rectangle
                const overlapRatio = overlapArea / rect.area;

                if (overlapRatio > overlapThreshold) {
                    shouldInclude = false;
                    break;
                }
            }

            if (shouldInclude) {
                filtered.push(rect);
            }
        }

        return filtered;
    }

    analyzeSlotSizes(rectangles, imagePath) {
        return new Promise(async (resolve) => {
            const slots = [];

            try {
                const image = await Jimp.read(imagePath);
                const annotatedImage = image.clone();

                // Standard slot size in pixels (might need calibration)
                const stdSlotWidth = 50;
                const stdSlotHeight = 50;

                for (const rect of rectangles) {
                    const { x, y, width, height } = rect;

                    // Calculate size in terms of grid cells
                    const widthCells = Math.max(1, Math.round(width / stdSlotWidth));
                    const heightCells = Math.max(1, Math.round(height / stdSlotHeight));

                    slots.push({
                        position: [x, y],
                        size: [widthCells, heightCells],
                        area: width * height
                    });

                    // Mark on the image if debug mode
                    if (this.config.debugMode) {
                        // Draw rectangle in red
                        const red = Jimp.rgbaToInt(255, 0, 0, 255);

                        // Draw rectangle borders
                        for (let i = 0; i < width; i++) {
                            if (y >= 0 && y < annotatedImage.getHeight() && x + i >= 0 && x + i < annotatedImage.getWidth())
                                annotatedImage.setPixelColor(red, x + i, y);
                            if (y + height - 1 >= 0 && y + height - 1 < annotatedImage.getHeight() && x + i >= 0 && x + i < annotatedImage.getWidth())
                                annotatedImage.setPixelColor(red, x + i, y + height - 1);
                        }

                        for (let i = 0; i < height; i++) {
                            if (y + i >= 0 && y + i < annotatedImage.getHeight() && x >= 0 && x < annotatedImage.getWidth())
                                annotatedImage.setPixelColor(red, x, y + i);
                            if (y + i >= 0 && y + i < annotatedImage.getHeight() && x + width - 1 >= 0 && x + width - 1 < annotatedImage.getWidth())
                                annotatedImage.setPixelColor(red, x + width - 1, y + i);
                        }
                    }
                }

                const timestamp = Date.now();
                const annotatedPath = path.join(this.config.outputDir, `annotated_${timestamp}.png`);
                await annotatedImage.writeAsync(annotatedPath);

                resolve({ slots, annotatedPath });
            } catch (error) {
                console.error('Error analyzing slot sizes:', error);
                resolve({ slots: [], annotatedPath: null });
            }
        });
    }

    optimizeInventoryLayout(slots) {
        // Sort slots by area in descending order
        const sortedSlots = [...slots].sort((a, b) => b.area - a.area);

        // Define grid size (typical Dark and Darker inventory grid)
        const gridWidth = 10;
        const gridHeight = 8;

        // Create an empty grid
        const grid = Array(gridHeight).fill().map(() => Array(gridWidth).fill(0));

        // Place items in the grid
        const placement = [];

        for (const slot of sortedSlots) {
            const [width, height] = slot.size;
            let placed = false;

            // Try to place the item in the grid
            for (let y = 0; y <= gridHeight - height; y++) {
                for (let x = 0; x <= gridWidth - width; x++) {
                    let canPlace = true;

                    // Check if the area is free
                    for (let dy = 0; dy < height; dy++) {
                        for (let dx = 0; dx < width; dx++) {
                            if (grid[y + dy][x + dx] === 1) {
                                canPlace = false;
                                break;
                            }
                        }
                        if (!canPlace) break;
                    }

                    if (canPlace) {
                        // Place the item in the grid
                        for (let dy = 0; dy < height; dy++) {
                            for (let dx = 0; dx < width; dx++) {
                                grid[y + dy][x + dx] = 1;
                            }
                        }

                        placement.push({
                            size: [width, height],
                            position: [x, y]
                        });

                        placed = true;
                        break;
                    }
                }
                if (placed) break;
            }
        }

        return { placement, grid };
    }

    async visualizeOptimizedLayout(grid, placement) {
        return new Promise(async (resolve) => {
            const gridHeight = grid.length;
            const gridWidth = grid[0].length;

            // Create a blank image for visualization
            const cellSize = 50; // pixels per grid cell
            const imgWidth = gridWidth * cellSize;
            const imgHeight = gridHeight * cellSize;

            // Create new image
            const layoutImg = new Jimp(imgWidth, imgHeight, 0x000000ff); // Black background

            // Draw the grid
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    // Draw grid cell borders in dark gray
                    const gray = Jimp.rgbaToInt(50, 50, 50, 255);

                    // Draw cell border
                    for (let i = 0; i < cellSize; i++) {
                        layoutImg.setPixelColor(gray, x * cellSize + i, y * cellSize);
                        layoutImg.setPixelColor(gray, x * cellSize + i, (y + 1) * cellSize - 1);
                    }

                    for (let i = 0; i < cellSize; i++) {
                        layoutImg.setPixelColor(gray, x * cellSize, y * cellSize + i);
                        layoutImg.setPixelColor(gray, (x + 1) * cellSize - 1, y * cellSize + i);
                    }
                }
            }

            // Colors for items - generate with seedrandom for consistency
            const colors = [
                Jimp.rgbaToInt(255, 0, 0, 255),     // Red
                Jimp.rgbaToInt(0, 255, 0, 255),     // Green
                Jimp.rgbaToInt(0, 0, 255, 255),     // Blue
                Jimp.rgbaToInt(255, 255, 0, 255),   // Yellow
                Jimp.rgbaToInt(255, 0, 255, 255),   // Magenta
                Jimp.rgbaToInt(0, 255, 255, 255),   // Cyan
                Jimp.rgbaToInt(128, 0, 0, 255),     // Dark Red
                Jimp.rgbaToInt(0, 128, 0, 255),     // Dark Green
                Jimp.rgbaToInt(0, 0, 128, 255)      // Dark Blue
            ];

            // Draw placed items
            for (let i = 0; i < placement.length; i++) {
                const item = placement[i];
                const [width, height] = item.size;
                const [x, y] = item.position;
                const color = colors[i % colors.length];

                // Fill rectangle
                for (let dy = 0; dy < height * cellSize; dy++) {
                    for (let dx = 0; dx < width * cellSize; dx++) {
                        layoutImg.setPixelColor(color, x * cellSize + dx, y * cellSize + dy);
                    }
                }

                // Draw white border
                const white = Jimp.rgbaToInt(255, 255, 255, 255);

                // Draw horizontal borders
                for (let dx = 0; dx < width * cellSize; dx++) {
                    layoutImg.setPixelColor(white, x * cellSize + dx, y * cellSize);
                    layoutImg.setPixelColor(white, x * cellSize + dx, y * cellSize + 1);
                    layoutImg.setPixelColor(white, x * cellSize + dx, (y + height) * cellSize - 1);
                    layoutImg.setPixelColor(white, x * cellSize + dx, (y + height) * cellSize - 2);
                }

                // Draw vertical borders
                for (let dy = 0; dy < height * cellSize; dy++) {
                    layoutImg.setPixelColor(white, x * cellSize, y * cellSize + dy);
                    layoutImg.setPixelColor(white, x * cellSize + 1, y * cellSize + dy);
                    layoutImg.setPixelColor(white, (x + width) * cellSize - 1, y * cellSize + dy);
                    layoutImg.setPixelColor(white, (x + width) * cellSize - 2, y * cellSize + dy);
                }
            }

            const timestamp = Date.now();
            const layoutPath = path.join(this.config.outputDir, `optimized_${timestamp}.png`);
            await layoutImg.writeAsync(layoutPath);

            resolve(layoutPath);
        });
    }

    async captureAndAnalyze() {
        try {
            console.log("Starting captureAndAnalyze...");
            // Capture screen
            const imagePath = await this.captureScreen();
            console.log(`Screen captured: ${imagePath}`);

            // Generate timestamp
            const timestamp = Date.now();

            // Save the captured image with timestamp
            const capturePath = path.join(this.config.outputDir, `capture_${timestamp}.png`);
            fs.copyFileSync(imagePath, capturePath);
            console.log(`Screenshot saved to ${capturePath}`);

            // Detect inventory grid
            console.log("Detecting inventory grid...");
            const slotContours = await this.detectInventoryGrid(capturePath);
            console.log(`Detected ${slotContours.length} slot contours`);

            // Analyze slot sizes
            console.log("Analyzing slot sizes...");
            const { slots, annotatedPath } = await this.analyzeSlotSizes(slotContours, capturePath);
            console.log(`Analyzed ${slots.length} slots, annotated image: ${annotatedPath}`);

            // Calculate optimal layout
            console.log("Calculating optimal layout...");
            const { placement, grid } = this.optimizeInventoryLayout(slots);
            console.log(`Created optimized layout with ${placement.length} items`);

            // Visualize optimized layout
            console.log("Visualizing optimized layout...");
            const layoutPath = await this.visualizeOptimizedLayout(grid, placement);
            console.log(`Layout visualization saved to ${layoutPath}`);

            console.log(`Analyzed ${slots.length} slots and created optimized layout`);

            // Generate some sample items for the UI
            const items = slots.map((slot, index) => ({
                id: `item_${index}`,
                name: `Item ${index + 1}`,
                type: index % 2 === 0 ? 'weapon' : 'armor',
                size: slot.size
            }));

            // Save analysis results as JSON
            const results = {
                timestamp,
                slots,
                items,
                optimized_placement: placement
            };

            const resultsPath = path.join(this.config.outputDir, `results_${timestamp}.json`);
            fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

            // Return paths for frontend to display
            return {
                original: capturePath,
                annotated: annotatedPath,
                optimized: layoutPath,
                items: items,
                results: resultsPath
            };
        } catch (error) {
            console.error('Error analyzing inventory:', error.stack);
            throw error;
        }
    }
}

// Create a shared analyzer instance
const analyzer = new InventoryAnalyzer();

// Setup IPC handlers for communicating with renderer process
function setupIPC(mainWindow) {
    ipcMain.on('capture-screen', async (event) => {
        try {
            const result = await analyzer.captureAndAnalyze();
            event.reply('capture-result', { status: 'success', data: result });
        } catch (error) {
            event.reply('capture-result', { status: 'error', message: error.message });
        }
    });

    ipcMain.on('get-config', (event) => {
        try {
            event.reply('config-result', { status: 'success', data: analyzer.config });
        } catch (error) {
            event.reply('config-result', { status: 'error', message: error.message });
        }
    });

    ipcMain.on('update-config', (event, config) => {
        try {
            analyzer.config = { ...analyzer.config, ...config };
            analyzer.saveConfig();
            event.reply('config-update-result', { status: 'success', data: analyzer.config });
        } catch (error) {
            event.reply('config-update-result', { status: 'error', message: error.message });
        }
    });

    ipcMain.on('get-results', (event) => {
        try {
            const resultsDir = analyzer.config.outputDir;
            const results = [];

            if (fs.existsSync(resultsDir)) {
                fs.readdirSync(resultsDir).forEach(file => {
                    if (file.startsWith('results_') && file.endsWith('.json')) {
                        const timestamp = file.replace('results_', '').replace('.json', '');
                        const filePath = path.join(resultsDir, file);
                        try {
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            results.push({
                                timestamp,
                                data
                            });
                        } catch (e) {
                            console.error(`Error reading ${filePath}:`, e);
                        }
                    }
                });
            }

            // Sort by timestamp (newest first)
            results.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

            event.reply('results-data', { status: 'success', data: results });
        } catch (error) {
            event.reply('results-data', { status: 'error', message: error.message });
        }
    });
}

module.exports = { InventoryAnalyzer, setupIPC, analyzer };