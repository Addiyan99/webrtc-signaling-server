# WebRTC Signaling Server

A Socket.IO-based signaling server for WebRTC voice calling with support for call management, user presence, and proper call state handling.

## 🚀 Live Server

**Server URL:** `https://webrtc-signaling-server-kb9g.onrender.com`

**Health Check:** 
```bash
curl https://webrtc-signaling-server-kb9g.onrender.com
```

## ✨ Features

- ✅ User registration and presence management
- ✅ Call initiation and routing by username
- ✅ Single device per user (latest login disconnects previous)
- ✅ Call answer/decline handling
- ✅ 30-second call timeout
- ✅ Busy signal detection
- ✅ ICE candidate exchange (trickle ICE)
- ✅ Proper call cleanup on disconnect
- ✅ Real-time connection monitoring

## 📡 API Endpoints

### REST Endpoints

#### `GET /`
Health check endpoint

**Response:**
```json
{
  "status": "WebRTC Signaling Server Running",
  "connectedUsers": 5,
  "activeCalls": 2,
  "timestamp": "2024-11-11T10:30:00.000Z"
}
```

#### `GET /users`
List all connected users

**Response:**
```json
{
  "connectedUsers": ["alice", "bob", "charlie"],
  "totalUsers": 3
}
```

## 🔌 Socket.IO Events

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `register_user` | `{userId: string}` | Register user with signaling server |
| `make_call` | `{to: string, from: string, offer: RTCSessionDescriptionInit}` | Initiate call with SDP offer |
| `answer_call` | `{to: string, from: string, answer: RTCSessionDescriptionInit}` | Respond to call with SDP answer |
| `decline_call` | `{to: string, from: string}` | Reject incoming call |
| `end_call` | `{to: string, from: string}` | Terminate active call |
| `ice_candidate` | `{to: string, from: string, candidate: RTCIceCandidateInit}` | Send ICE candidate |
| `logout_user` | `{userId: string}` | Manual logout |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user_registered` | `{success: boolean, userId: string}` | Registration confirmation |
| `incoming_call` | `{from: string, offer: RTCSessionDescriptionInit}` | Receive incoming call |
| `call_answered` | `{from: string, answer: RTCSessionDescriptionInit}` | Call was answered |
| `call_declined` | `{from: string}` | Call was rejected |
| `call_ended` | `{from: string, reason?: string}` | Call terminated |
| `call_timeout` | `{user: string}` | Call not answered within 30 seconds |
| `call_busy` | `{targetUser: string}` | User is already in another call |
| `call_failed` | `{error: string, targetUser: string}` | Call failed (user offline/error) |
| `ice_candidate` | `{from: string, candidate: RTCIceCandidateInit}` | Receive ICE candidate |
| `force_disconnect` | `{reason: string}` | Client forced to disconnect (new login detected) |

## 🔄 Call Flow Example

```javascript
// User A registers
socket.emit('register_user', { userId: 'alice' });

// User A calls User B
socket.emit('make_call', {
  to: 'bob',
  from: 'alice',
  offer: sdpOffer
});

// User B receives call
socket.on('incoming_call', ({ from, offer }) => {
  console.log(`Incoming call from ${from}`);
});

// User B answers
socket.emit('answer_call', {
  to: 'alice',
  from: 'bob',
  answer: sdpAnswer
});

// User A receives answer
socket.on('call_answered', ({ from, answer }) => {
  console.log(`${from} answered the call`);
});

// Exchange ICE candidates (both sides)
socket.emit('ice_candidate', {
  to: 'bob',
  from: 'alice',
  candidate: iceCandidate
});

socket.on('ice_candidate', ({ from, candidate }) => {
  peerConnection.addIceCandidate(candidate);
});

// End call
socket.emit('end_call', {
  to: 'bob',
  from: 'alice'
});
```

## 🏗️ Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Client A   │◄───────►│   Signaling  │◄───────►│  Client B   │
│  (Socket)   │ Socket  │    Server    │ Socket  │  (Socket)   │
└─────────────┘  .IO    │  (Node.js)   │  .IO    └─────────────┘
                        └──────────────┘
                               │
                       ┌───────┴────────┐
                       │                │
                   User State      Call State
                   Management      Management
```

## 🚀 Deployment

### Render.com (Current Deployment)

**Automatic Deployment:**
1. Push to GitHub repository
2. Render auto-detects changes
3. Runs `npm install`
4. Starts server with `node server.js`

**Environment Variables:**
- `PORT` - Automatically set by Render
- No additional variables needed for POC

### Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs on http://localhost:3000
```

**Test Connection:**
```bash
curl http://localhost:3000
```

## 📦 Dependencies

```json
{
  "express": "^4.18.2",
  "socket.io": "^4.7.2",
  "cors": "^2.8.5"
}
```

## 🔧 Configuration

### Port
```javascript
const PORT = process.env.PORT || 3000;
```

### CORS Settings
```javascript
cors: {
  origin: "*",  // Allow all origins (POC only!)
  methods: ["GET", "POST"],
  credentials: true
}
```

**⚠️ Production:** Restrict CORS to specific domains:
```javascript
cors: {
  origin: ["https://yourdomain.com", "capacitor://localhost"],
  methods: ["GET", "POST"],
  credentials: true
}
```

### Call Timeout
```javascript
const CALL_TIMEOUT_MS = 30000; // 30 seconds
```

## 🧪 Testing

### Manual Testing

**Terminal 1:**
```bash
node server.js
```

**Terminal 2:**
```bash
# Test health endpoint
curl http://localhost:3000

# Test users endpoint
curl http://localhost:3000/users
```

**Browser Console:**
```javascript
// Connect to server
const socket = io('http://localhost:3000');

// Register user
socket.emit('register_user', { userId: 'testuser' });

// Listen for confirmation
socket.on('user_registered', (data) => {
  console.log('Registered:', data);
});
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Create test config (artillery.yml)
# Run test
artillery run artillery.yml
```

## 📊 Monitoring

### Server Logs

```javascript
// Check connected users
console.log(`Total connected users: ${connectedUsers.size}`);

// Check active calls
console.log(`Active calls: ${activeCalls.size}`);
```

### Render Dashboard
- View real-time logs
- Monitor CPU/memory usage
- Check request metrics

## 🐛 Troubleshooting

### Issue: "Cannot GET /"
**Solution:** Server is running, this is the correct response. Check `/` endpoint returns JSON.

### Issue: Socket.IO connection fails
**Solution:** 
1. Check CORS settings
2. Verify WebSocket support on hosting platform
3. Check firewall rules

### Issue: Users can't connect
**Solution:**
1. Check server logs for errors
2. Verify client is using correct URL
3. Test with `curl` to confirm server is accessible

### Issue: Calls timing out immediately
**Solution:**
1. Check `CALL_TIMEOUT_MS` value
2. Verify both users are online
3. Check signaling events are being received

## 🔒 Security Considerations

### For Production:

1. **Authentication:**
   ```javascript
   // Validate user tokens
   io.use((socket, next) => {
     const token = socket.handshake.auth.token;
     if (isValidToken(token)) {
       next();
     } else {
       next(new Error('Authentication error'));
     }
   });
   ```

2. **Rate Limiting:**
   ```javascript
   // Limit calls per user
   const callLimiter = new Map(); // userId -> call count
   ```

3. **Input Validation:**
   ```javascript
   // Sanitize user IDs
   const sanitizeUserId = (userId) => {
     return userId.replace(/[^a-zA-Z0-9_-]/g, '');
   };
   ```

4. **CORS Restrictions:**
   ```javascript
   // Whitelist specific origins
   cors: {
     origin: ['https://yourdomain.com']
   }
   ```

## 📈 Scaling

### Single Server (Current - POC)
- Handles 100+ concurrent users
- Good for: POC, small deployments

### Horizontal Scaling (Production)
```javascript
// Use Redis adapter for multiple server instances
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## 📞 Support

**Issues:**
- Check logs: `https://dashboard.render.com` → Your Service → Logs
- Test endpoints: `curl https://webrtc-signaling-server-kb9g.onrender.com`
