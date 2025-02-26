const socketIo = require('socket.io');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');
require('dotenv').config(); // Load environment variables

let io;

function initializeSocket(server) {
    io = socketIo(server, {
        cors: {
            origin: process.env.FRONTEND_URL|| "https://raftaar-frontend-dun.vercel.app" || "http://localhost:5173", // Use .env variable
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log(`✅ Client connected: ${socket.id}`);

        // Handle user/captain joining
        socket.on("join", async (data) => {
            try {
                const { userId, userType } = data;

                if (userType === "captain") {
                    await captainModel.findByIdAndUpdate(userId, { socketId: socket.id });
                } else if (userType === "rider") {
                    await userModel.findByIdAndUpdate(userId, { socketId: socket.id });
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

        // Handle client disconnection
        socket.on("disconnect", async () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
            try {
                // Remove socketId from the captain or user document
                await captainModel.findOneAndUpdate({ socketId: socket.id }, { $unset: { socketId: 1 } });
                await userModel.findOneAndUpdate({ socketId: socket.id }, { $unset: { socketId: 1 } });
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
