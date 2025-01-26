#!/bin/bash

# Start the backend server
node server.js $ROS_URL &

# Start the Vite development server in the background
npm run preview -- --host 0.0.0.0 --port $VITE_PORT
