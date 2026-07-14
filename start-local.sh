#!/bin/bash

# Kill any existing processes on 3001 and 5173 if possible
echo "Checking ports..."
PID_3001=$(lsof -t -i:3001)
if [ ! -z "$PID_3001" ]; then
  echo "Found process $PID_3001 on port 3001. Attempting to kill..."
  kill -9 $PID_3001 2>/dev/null || echo "Could not automatically kill process on 3001. If the server fails to start, please kill it manually or use: kill -9 $PID_3001"
fi

PID_5173=$(lsof -t -i:5173)
if [ ! -z "$PID_5173" ]; then
  echo "Found process $PID_5173 on port 5173. Attempting to kill..."
  kill -9 $PID_5173 2>/dev/null
fi

# Ensure dependencies are installed if node_modules are missing
if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

echo "Starting Backend Proxy Server on port 3001..."
cd backend
npm run dev &
BACKEND_PID=$!

echo "Starting Frontend Dev Server on port 5173..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=================================================="
echo "Interview Copilot starting up!"
echo "Backend API: http://localhost:3001"
echo "Frontend UI: http://localhost:5173"
echo "=================================================="
echo "Press Ctrl+C to stop both servers."
echo "=================================================="
echo ""

# Handle exit cleanly by killing both background processes
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
