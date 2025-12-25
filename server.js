const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Allow connections from your frontend URL (or all for now)
app.use(cors({ origin: "*" }));

// Health check for Render (Prevents the service from being marked as 'down')
app.get('/health', (req, res) => {
  res.status(200).send('Server is healthy');
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  maxHttpBufferSize: 1e8, // 100MB
  pingTimeout: 60000,     // Wait 60s for client response (essential for slow uploads)
  pingInterval: 25000,    // Send heartbeats every 25s
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("join-session", (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined: ${sessionId}`);
    
    // Broadcast to others in the room
    socket.to(sessionId).emit("peer-joined", socket.id);
    socket.emit("joined");
  });

  socket.on("send-file", (payload) => {
    if (!payload.sessionId || !payload.data) return;

    console.log(`Relaying file: ${payload.name} to session: ${payload.sessionId}`);
    
    // Broadcast the file only to other people in the specific session
    socket.to(payload.sessionId).emit("receive-file", {
      name: payload.name,
      data: payload.data,
      size: payload.size,
      type: payload.type
    });
  });

  // WebRTC Signaling Logic
  socket.on("offer", (data) => socket.to(data.sessionId).emit("offer", data));
  socket.on("answer", (data) => socket.to(data.sessionId).emit("answer", data));
  socket.on("ice-candidate", (data) => socket.to(data.sessionId).emit("ice-candidate", data));

  socket.on("nuke-session", (sessionId) => {
    io.to(sessionId).emit("force-wipe");
  });

  socket.on("disconnect", () => console.log(`Disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server live on port ${PORT}`);
});