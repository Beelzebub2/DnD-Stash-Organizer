# Dark and Darker Inventory Optimizer

This application allows you to optimize your Dark and Darker inventory by capturing your screen, analyzing item sizes, and calculating the optimal arrangement of items in your inventory grid.

## Features

- Screen capture on hotkey press (default: F12)
- Automatic detection of item slots and their sizes (1x1, 1x2, 2x2, 3x2, etc.)
- Calculates and visualizes optimal inventory arrangement
- History of past analyses
- Configurable settings

## Requirements

### For Backend (Python)
- Python 3.7+
- mss (for screen capture)
- OpenCV (for image analysis)
- Flask (for API server)
- NumPy
- pynput

### For Frontend (Electron)
- Node.js 14+ and npm

## Installation

### Backend Setup

1. Navigate to the backend directory:
```
cd backend
```

2. Install the required Python packages:
```
pip install -r requirements.txt
```

### Frontend Setup

1. Navigate to the frontend directory:
```
cd frontend
```

2. Install the required npm packages:
```
npm install
```

## Usage

### Starting the Application

1. First, start the Python backend server:
```
cd backend
python api.py
```

2. Then, in a new terminal, start the Electron frontend:
```
cd frontend
npm start
```

### Using the Application

1. When the application starts, it will check if the Python backend is running
2. Click the "Capture Screen" button or press F12 to capture your inventory screen
3. The application will analyze the image, detect item slots, and calculate the optimal arrangement
4. View the results in the interface
5. Access past analyses in the History tab
6. Configure settings in the Settings tab

## Configuration

You can configure the application in the Settings tab:

- API URL: The URL where the Python backend is running (default: http://localhost:5000)
- Capture Key: The key to press to capture the screen (default: F12)
- Debug Mode: Enable/disable debug mode for additional visual output during analysis

## Calibration

For best results, you may need to calibrate the application to your specific Dark and Darker UI:

1. Take a screenshot of your inventory
2. In the Settings tab, click "Calibrate Inventory Region" 
3. Follow the instructions to define the inventory area

## License

This project is licensed under the Apache License 2.0. See the LICENSE file for details.