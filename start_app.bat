@echo off
echo Starting Dark and Darker Inventory Optimizer...

echo Starting Python backend server...
start cmd /k "cd C:\Users\ricar\Downloads\Dark And Darker\backend && C:\Users\ricar\AppData\Local\Programs\Python\Python311\python.exe python api.py"

echo Waiting for backend to initialize...
timeout /t 3

echo Starting Electron frontend...
start cmd /k "cd frontend && npm start"

echo Application started!
echo - Backend is running on http://localhost:5000
echo - Frontend should open automatically
echo.
echo Press any key to exit this launcher (application will continue running)
pause > nul