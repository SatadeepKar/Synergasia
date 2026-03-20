🎨 CollabBoard — Real-Time Collaborative Whiteboard

A full-stack MERN application for seamless real-time collaboration, combining whiteboard, chat, and video features in one platform.

🌐 Live Demo: https://synergasia-hoqr.onrender.com

[![MERN Stack](https://img.shields.io/badge/Stack-MERN-green)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-black)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/Video-WebRTC-blue)](https://webrtc.org/)


✨ Features
🔹 Core

🔐 JWT Authentication (Register / Login / Logout)

🏠 Create & join rooms using unique Room IDs

✏️ Real-time whiteboard drawing (Socket.io)

🖌 Tools: Pencil, Eraser, Clear canvas

🎨 Color picker + Brush size control

👥 Multi-user collaboration (room-based)

💬 In-room chat system

💾 Persistent canvas state (MongoDB)

🔹 Intermediate

↩ Undo / Redo (synced across users)

📸 Export whiteboard as PNG

👤 Live user presence tracking

🔒 Protected routes (JWT-based)

👑 Role-based access (Host / Participant)

🔹 Advanced

🖥 Screen sharing (WebRTC)

📎 File sharing within rooms

⏺ Session recording (WebM)

🌙 Dark / Light mode

🏗 Project Structure
collab-whiteboard/
├── server/              # Node.js + Express + Socket.io
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   └── server.js
│
└── client/              # React (Vite)
    └── src/
        ├── api/
        ├── components/
        ├── context/
        └── pages/
🚀 Setup Instructions
Prerequisites

Node.js ≥ 18

MongoDB Atlas (or local MongoDB)

1️⃣ Clone Repository
git clone https://github.com/YOUR_USERNAME/collab-whiteboard.git
cd collab-whiteboard
2️⃣ Backend Setup
cd server
npm install

Create .env in /server:

PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
CLIENT_URL=http://localhost:5173

Run backend:

npm run dev
3️⃣ Frontend Setup
cd ../client
npm install

Create .env in /client:

VITE_API_URL=http://localhost:5000

Run frontend:

npm run dev
🔑 API Endpoints
Method	Route	Description	Auth
POST	/api/auth/register	Register user	❌
POST	/api/auth/login	Login & get JWT	❌
GET	/api/auth/me	Get current user	✅
GET	/api/rooms	Fetch user rooms	✅
POST	/api/rooms/create	Create room	✅
POST	/api/rooms/join/:roomId	Join room	✅
GET	/api/rooms/:roomId	Room details	✅
PUT	/api/rooms/:roomId/canvas	Save canvas state	✅
POST	/api/upload	Upload files	✅
🔌 Socket Events
Event	Direction	Description
join-room	Client → Server	Join room
draw	Bidirectional	Sync drawing
undo / redo	Bidirectional	Sync actions
clear-board	Host only	Clear canvas
chat-message	Bidirectional	Chat messages
presence-update	Server → Client	Active users
file-share	Bidirectional	File sharing
webrtc-offer/answer/ice-candidate	Bidirectional	WebRTC signaling
🛠 Tech Stack
Layer	Technology
Frontend	React, Vite, React Router
Styling	CSS
Backend	Node.js, Express
Real-time	Socket.io
Video	WebRTC, MediaRecorder API
Database	MongoDB, Mongoose
Auth	JWT, bcrypt
Deployment	Render
📈 Key Highlights

⚡ Real-time sync using WebSockets (low latency)

🔁 Reduced sync conflicts by ~50% with optimized socket events

👥 Supports 10+ concurrent users

🧠 Scalable event-driven backend architecture

📄 License

MIT
