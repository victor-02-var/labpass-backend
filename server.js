const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Allow connections from your frontend URL (or all for now)
app.use(cors({ origin: "*" }));

// Health check for Render
app.get('/health', (req, res) => {
  res.status(200).send('Server is healthy');
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  maxHttpBufferSize: 1e8, // 100MB
  pingTimeout: 60000,     // Wait 60s for client response
  pingInterval: 25000,    // Send heartbeats every 25s
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  // --- 1. HOST LOGIC (Create or Join) ---
  // The Host uses this. It creates the room if it doesn't exist.
  socket.on("join-session", (sessionId) => {
    socket.join(sessionId);
    console.log(`Host ${socket.id} created/joined session: ${sessionId}`);
    
    // Broadcast to others (if any)
    socket.to(sessionId).emit("peer-joined", socket.id);
    socket.emit("joined");
  });

  // --- 2. SENDER LOGIC (Join Only - Strict) ---
  // The Sender uses this. It REJECTS if the room is empty/doesn't exist.
  socket.on("join-session-sender", (sessionId) => {
    const room = io.sockets.adapter.rooms.get(sessionId);
    
    // Check if the room exists and has at least one person (The Host)
    if (room && room.size > 0) {
      socket.join(sessionId);
      console.log(`Sender ${socket.id} joined existing session: ${sessionId}`);
      
      // Notify Host
      socket.to(sessionId).emit("peer-joined", socket.id);
      // Notify Sender (Success)
      socket.emit("joined");
    } else {
      // Room doesn't exist -> Reject the connection
      console.log(`Sender ${socket.id} failed to join invalid session: ${sessionId}`);
      socket.emit("invalid-session", "Session not found or host is offline.");
    }
  });

  // --- 3. FILE TRANSFER LOGIC ---
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

  // --- 4. SIGNALING & UTILS ---
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