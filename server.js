const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for all requests
app.use(cors());
app.use(express.json());

// Initialize Socket.IO with CORS enabled
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store connected users and active calls
const connectedUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId
const activeCalls = new Map(); // userId -> { inCall: boolean, withUser: string }
const callTimers = new Map(); // callId -> timeoutId

const PORT = process.env.PORT || 3000;
const CALL_TIMEOUT_MS = 30000; // 30 seconds

// Basic health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'WebRTC Signaling Server Running',
    connectedUsers: connectedUsers.size,
    activeCalls: activeCalls.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/users', (req, res) => {
  res.json({
    connectedUsers: Array.from(connectedUsers.keys()),
    totalUsers: connectedUsers.size
  });
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  // Handle user registration
  socket.on('register_user', (data) => {
    const { userId } = data;
    console.log(`Registering user: ${userId} with socket: ${socket.id}`);
    
    // Check if user is already connected
    if (connectedUsers.has(userId)) {
      console.log(`User ${userId} already connected, updating socket`);
      const oldSocketId = connectedUsers.get(userId);
      
      // Disconnect old socket
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) {
        oldSocket.emit('force_disconnect', { reason: 'New login detected' });
        oldSocket.disconnect(true);
      }
      
      userSockets.delete(oldSocketId);
    }
    
    // Register user
    connectedUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);
    activeCalls.set(userId, { inCall: false, withUser: null });
    
    socket.emit('user_registered', { success: true, userId });
    console.log(`User registered successfully: ${userId}`);
    console.log(`Total connected users: ${connectedUsers.size}`);
  });
  
  // Handle call initiation
  socket.on('make_call', (data) => {
    const { to, from, offer } = data;
    console.log(`Call from ${from} to ${to}`);
    
    const targetSocketId = connectedUsers.get(to);
    const callerStatus = activeCalls.get(from);
    const calleeStatus = activeCalls.get(to);
    
    // Check if caller is already in a call
    if (callerStatus && callerStatus.inCall) {
      console.log(`Caller ${from} is already in a call`);
      socket.emit('call_failed', { 
        error: 'You are already in a call',
        targetUser: to 
      });
      return;
    }
    
    // Check if target user exists and is online
    if (!targetSocketId) {
      console.log(`User ${to} not found or not connected`);
      socket.emit('call_failed', { 
        error: 'User not found or offline',
        targetUser: to 
      });
      return;
    }
    
    // Check if callee is already in a call
    if (calleeStatus && calleeStatus.inCall) {
      console.log(`User ${to} is busy in another call`);
      socket.emit('call_busy', { 
        targetUser: to 
      });
      return;
    }
    
    // Mark both users as in call
    activeCalls.set(from, { inCall: true, withUser: to });
    activeCalls.set(to, { inCall: true, withUser: from });
    
    // Set call timeout
    const callId = `${from}-${to}`;
    const timeoutId = setTimeout(() => {
      console.log(`Call timeout: ${callId}`);
      
      // Notify both parties
      const fromSocket = connectedUsers.get(from);
      const toSocket = connectedUsers.get(to);
      
      if (fromSocket) {
        io.to(fromSocket).emit('call_timeout', { user: to });
      }
      if (toSocket) {
        io.to(toSocket).emit('call_timeout', { user: from });
      }
      
      // Reset call status
      activeCalls.set(from, { inCall: false, withUser: null });
      activeCalls.set(to, { inCall: false, withUser: null });
      
      callTimers.delete(callId);
    }, CALL_TIMEOUT_MS);
    
    callTimers.set(callId, timeoutId);
    
    console.log(`Forwarding call to ${to} at socket ${targetSocketId}`);
    io.to(targetSocketId).emit('incoming_call', {
      from,
      offer
    });
  });
  
  // Handle call answer
  socket.on('answer_call', (data) => {
    const { to, from, answer } = data;
    console.log(`Answer from ${from} to ${to}`);
    
    // Clear call timeout
    const callId = `${to}-${from}`;
    const timeoutId = callTimers.get(callId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      callTimers.delete(callId);
    }
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      console.log(`Forwarding answer to ${to} at socket ${targetSocketId}`);
      io.to(targetSocketId).emit('call_answered', {
        from,
        answer
      });
    } else {
      console.log(`User ${to} not found for answer`);
    }
  });
  
  // Handle call decline
  socket.on('decline_call', (data) => {
    const { to, from } = data;
    console.log(`Call declined by ${from}, notifying ${to}`);
    
    // Clear call timeout
    const callId = `${to}-${from}`;
    const timeoutId = callTimers.get(callId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      callTimers.delete(callId);
    }
    
    // Reset call status
    activeCalls.set(from, { inCall: false, withUser: null });
    activeCalls.set(to, { inCall: false, withUser: null });
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_declined', { from });
    }
  });
  
  // Handle call end
  socket.on('end_call', (data) => {
    const { to, from } = data;
    console.log(`Call ended by ${from}, notifying ${to}`);
    
    // Clear any pending timeout
    const callId1 = `${from}-${to}`;
    const callId2 = `${to}-${from}`;
    [callId1, callId2].forEach(id => {
      const timeoutId = callTimers.get(id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        callTimers.delete(id);
      }
    });
    
    // Reset call status
    activeCalls.set(from, { inCall: false, withUser: null });
    activeCalls.set(to, { inCall: false, withUser: null });
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended', { from });
    }
  });
  
  // Handle ICE candidates (for ongoing call)
  socket.on('ice_candidate', (data) => {
    const { to, from, candidate } = data;
    console.log(`ICE candidate from ${from} to ${to}`);
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice_candidate', {
        from,
        candidate
      });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    const userId = userSockets.get(socket.id);
    if (userId) {
      console.log(`Unregistering user: ${userId}`);
      
      // Check if user was in a call
      const callStatus = activeCalls.get(userId);
      if (callStatus && callStatus.inCall && callStatus.withUser) {
        const otherUser = callStatus.withUser;
        const otherSocketId = connectedUsers.get(otherUser);
        
        // Notify the other user
        if (otherSocketId) {
          io.to(otherSocketId).emit('call_ended', { 
            from: userId,
            reason: 'disconnected' 
          });
        }
        
        // Reset other user's call status
        activeCalls.set(otherUser, { inCall: false, withUser: null });
        
        // Clear any pending timeouts
        const callId1 = `${userId}-${otherUser}`;
        const callId2 = `${otherUser}-${userId}`;
        [callId1, callId2].forEach(id => {
          const timeoutId = callTimers.get(id);
          if (timeoutId) {
            clearTimeout(timeoutId);
            callTimers.delete(id);
          }
        });
      }
      
      connectedUsers.delete(userId);
      userSockets.delete(socket.id);
      activeCalls.delete(userId);
      
      console.log(`Total connected users: ${connectedUsers.size}`);
    }
  });
  
  // Handle manual user logout
  socket.on('logout_user', (data) => {
    const { userId } = data;
    console.log(`Manual logout for user: ${userId}`);
    
    if (connectedUsers.has(userId)) {
      // Check if user was in a call
      const callStatus = activeCalls.get(userId);
      if (callStatus && callStatus.inCall && callStatus.withUser) {
        const otherUser = callStatus.withUser;
        const otherSocketId = connectedUsers.get(otherUser);
        
        // Notify the other user
        if (otherSocketId) {
          io.to(otherSocketId).emit('call_ended', { 
            from: userId,
            reason: 'logged out' 
          });
        }
        
        // Reset other user's call status
        activeCalls.set(otherUser, { inCall: false, withUser: null });
      }
      
      connectedUsers.delete(userId);
      userSockets.delete(socket.id);
      activeCalls.delete(userId);
      socket.emit('logout_success', { userId });
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 WebRTC Signaling Server running on port ${PORT}`);
  console.log(`📡 Socket.IO enabled with CORS support`);
  console.log(`🌐 Health check: http://localhost:${PORT}`);
  console.log(`👥 Users endpoint: http://localhost:${PORT}/users`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  
  // Clear all timers
  callTimers.forEach(timeoutId => clearTimeout(timeoutId));
  callTimers.clear();
  
  server.close(() => {
    console.log('Server closed.');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  
  // Clear all timers
  callTimers.forEach(timeoutId => clearTimeout(timeoutId));
  callTimers.clear();
  
  server.close(() => {
    console.log('Server closed.');
  });
});
