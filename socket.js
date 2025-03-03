const socketIo = require('socket.io');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Load environment variables

let io;

function initializeSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "https://raftaar-frontend-dun.vercel.app" || "http://localhost:5173", // Use .env variable
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Authenticate the socket connection with a token
    const token = socket.handshake.auth.token; // Expect token in handshake
    console.log('Socket - Token received:', token);

    if (!token || typeof token !== 'string' || token.trim() === '') {
      console.log('Socket - No valid token provided, disconnecting');
      socket.emit('error', { message: 'Unauthorized: No valid token provided' });
      socket.disconnect(true);
      return;
    }

    let decoded;
    try {
      if (token.split('.').length !== 3) {
        throw new Error('Invalid token format');
      }
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Socket - Decoded token:', decoded);
    } catch (err) {
      console.error('Socket - Invalid token:', err.message);
      socket.emit('error', { message: 'Unauthorized: Invalid token' });
      socket.disconnect(true);
      return;
    }

    // Handle user/captain joining
    socket.on("join", async (data) => {
      try {
        const { userId, userType } = data;

        if (userId !== decoded._id) {
          throw new Error('User ID mismatch with token');
        }

        if (userType === "captain") {
          await captainModel.findByIdAndUpdate(userId, { socketId: socket.id });
        } else if (userType === "rider") {
          await userModel.findByIdAndUpdate(userId, { socketId: socket.id });
        } else {
          throw new Error('Invalid userType');
        }

        console.log(`📌 ${userType} ${userId} joined with socket ID: ${socket.id}`);
      } catch (error) {
        console.error("❌ Error updating socket ID:", error);
        socket.emit("error", { message: "Failed to update socket ID" });
      }
    });

    // Handle captain location updates
    socket.on("update-location-captain", async (data) => {
      try {
        const { userId, location } = data;

        if (userId !== decoded._id) {
          throw new Error('User ID mismatch with token');
        }

        if (!location || !location.ltd || !location.lng) {
          return socket.emit("error", { message: "Invalid location data" });
        }

        await captainModel.findByIdAndUpdate(userId, {
          location: {
            type: "Point",
            coordinates: [location.lng, location.ltd], // GeoJSON format: [longitude, latitude]
          },
        });

        console.log(`📍 Captain ${userId} updated location: (${location.ltd}, ${location.lng})`);

        // Broadcast the updated location to all connected clients
        io.emit("captain-location-update", { userId, location });
      } catch (error) {
        console.error("❌ Error updating captain location:", error);
        socket.emit("error", { message: "Failed to update location" });
      }
    });

    // Handle explicit logout event
    socket.on("logout", async () => {
      console.log(`📴 Client logging out: ${socket.id}`);
      try {
        await captainModel.updateOne({ socketId: socket.id }, { $unset: { socketId: 1 } });
        await userModel.updateOne({ socketId: socket.id }, { $unset: { socketId: 1 } });
        socket.disconnect(true);
      } catch (error) {
        console.error("❌ Error cleaning up socket ID on logout:", error);
      }
    });

    // Handle client disconnection
    socket.on("disconnect", async () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
      try {
        // Remove socketId from the captain or user document
        await captainModel.updateOne({ socketId: socket.id }, { $unset: { socketId: 1 } });
        await userModel.updateOne({ socketId: socket.id }, { $unset: { socketId: 1 } });
      } catch (error) {
        console.error("❌ Error cleaning up socket ID:", error);
      }
    });
  });
}

const sendMessageToSocketId = (socketId, messageObject) => {
  if (io) {
    io.to(socketId).emit(messageObject.event, messageObject.data);
    console.log(`📢 Message sent to ${socketId}:`, messageObject);
  } else {
    console.log("❌ Socket.io not initialized.");
  }
};

module.exports = { initializeSocket, sendMessageToSocketId };