# 🎨 CollabBoard — Real-Time Collaborative Whiteboard

> A full-stack MERN application for real-time collaborative drawing, inspired by Miro + Zoom.

[![MERN Stack](https://img.shields.io/badge/Stack-MERN-green)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-black)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/Video-WebRTC-blue)](https://webrtc.org/)

---

## ✨ Features

### Core
- 🔐 JWT Authentication (Register / Login / Logout)
- 🏠 Create & Join Whiteboard Rooms with unique Room IDs
- ✏️ Real-time drawing sync (Socket.io)
- 🖌 Canvas Tools: Pencil, Eraser, Clear
- 🎨 Color picker + Brush size slider
- 👥 Room-based multi-user collaboration
- 💬 In-room Chat
- 💾 Canvas state persisted to MongoDB

### Intermediate
- ↩ Undo / Redo (local + broadcast to all users)
- 📸 Save whiteboard snapshot as PNG
- 👤 User presence indicator (who is online)
- 🔒 Protected routes (JWT-gated frontend routes)
- 👑 Role-based permissions (Host / Participant)

### Advanced
- 🖥 Screen sharing via WebRTC
- 📎 File sharing inside room
- ⏺ Session recording (WebM download)
- 🌙 Dark / Light mode toggle

---

## 🏗 Project Structure

```
Capstone Project/
├── server/          # Express + Socket.io backend
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   └── server.js
└── client/          # React (Vite) frontend
    └── src/
        ├── api/
        ├── components/
        ├── context/
        └── pages/
```

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js ≥ 18
- MongoDB Atlas account (free tier works)

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/collab-whiteboard.git
cd collab-whiteboard
```

### 2. Backend Setup
```bash
cd server
npm install
```

Create `server/.env`:
```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net/collab-whiteboard
JWT_SECRET=your_secret_key_here
CLIENT_URL=http://localhost:5173
```

```bash
npm run dev   # starts on http://localhost:5000
```

### 3. Frontend Setup
```bash
cd ../client
npm install
```

Create `client/.env`:
```env
VITE_API_URL=http://localhost:5000
```

```bash
npm run dev   # starts on http://localhost:5173
```

---

---

## 🔑 API Endpoints

| Method | Route | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Create account | ❌ |
| POST | `/api/auth/login` | Login, get JWT | ❌ |
| GET | `/api/auth/me` | Current user | ✅ |
| GET | `/api/rooms` | List user rooms | ✅ |
| POST | `/api/rooms/create` | Create room | ✅ |
| POST | `/api/rooms/join/:roomId` | Join room | ✅ |
| GET | `/api/rooms/:roomId` | Get room data | ✅ |
| PUT | `/api/rooms/:roomId/canvas` | Save canvas | ✅ |
| POST | `/api/upload` | Upload file | ✅ |

---

## 🔌 Socket Events

| Event | Direction | Description |
|---|---|---|
| `join-room` | Client → Server | Join a whiteboard room |
| `draw` | Bidirectional | Broadcast drawing strokes |
| `undo` / `redo` | Bidirectional | Sync history actions |
| `clear-board` | Host only | Clear the canvas |
| `chat-message` | Bidirectional | Send/receive chat |
| `presence-update` | Server → Client | Online users list |
| `file-share` | Bidirectional | Share files |
| `webrtc-offer/answer/ice-candidate` | Bidirectional | WebRTC signaling |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router DOM v6 |
| Styling | Vanilla CSS (custom properties, glassmorphism) |
| Real-time | Socket.io v4 |
| Video | WebRTC (screen share), MediaRecorder API |
| Backend | Node.js, Express.js |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Deployment | Vercel (client) + Render (server) |

---

## 📄 License
MIT
