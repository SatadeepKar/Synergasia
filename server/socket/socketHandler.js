const Room = require('../models/Room');

// Track online users per room: roomId -> Map(socketId -> {userId, userName, canDraw})
const roomUsers = {};
// Track draw permissions per room: roomId -> Set of userIds allowed to draw
const drawPermissions = {};
// Track who is in a video call per room: roomId -> Set of socketIds
const videoCallUsers = {};

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ───────────────────────── JOIN ROOM ─────────────────────────
    socket.on('join-room', async ({ roomId, userId, userName }) => {
      socket.join(roomId);
      socket.data = { roomId, userId, userName };

      if (!roomUsers[roomId]) roomUsers[roomId] = {};
      if (!drawPermissions[roomId]) drawPermissions[roomId] = new Set();

      // Host always gets draw permission, others get it by default too
      const isHost = await checkIsHost(roomId, userId);
      if (isHost) drawPermissions[roomId].add(userId);
      else drawPermissions[roomId].add(userId); // default: everyone can draw

      const canDraw = drawPermissions[roomId].has(userId);
      roomUsers[roomId][socket.id] = { userId, userName, canDraw };

      // Send existing canvas state to the new joiner
      try {
        const room = await Room.findOne({ roomId });
        if (room) {
          socket.emit('canvas-state-sync', room.canvasState);
          socket.emit('chat-history', room.chatMessages);
        }
      } catch (_) {}

      // Send draw permission to this user
      socket.emit('draw-permission', { canDraw });

      // Broadcast updated presence to the whole room
      broadcastPresence(io, roomId);
      socket.to(roomId).emit('user-joined', { userId, userName });
    });

    // ───────────────────────── DRAWING ──────────────────────────
    socket.on('draw', (data) => {
      const { userId } = socket.data || {};
      const roomId = data.roomId;
      // Check permission before broadcasting
      if (drawPermissions[roomId] && !drawPermissions[roomId].has(userId)) {
        socket.emit('draw-blocked', { message: 'Drawing is disabled by the host' });
        return;
      }
      socket.to(roomId).emit('draw', data.stroke);
    });

    socket.on('stroke-remove', ({ roomId, index }) => {
      socket.to(roomId).emit('stroke-remove', { index });
    });

    socket.on('undo', ({ roomId }) => {
      const { userId } = socket.data || {};
      if (drawPermissions[roomId] && !drawPermissions[roomId].has(userId)) return;
      socket.to(roomId).emit('undo');
    });

    socket.on('redo', ({ roomId }) => {
      const { userId } = socket.data || {};
      if (drawPermissions[roomId] && !drawPermissions[roomId].has(userId)) return;
      socket.to(roomId).emit('redo');
    });

    socket.on('clear-board', async ({ roomId, userId }) => {
      try {
        const room = await Room.findOne({ roomId });
        if (room && String(room.host) === String(userId)) {
          room.canvasState = '[]';
          await room.save();
          io.to(roomId).emit('clear-board');
        }
      } catch (_) {}
    });

    socket.on('save-canvas', async ({ roomId, canvasState }) => {
      try {
        await Room.findOneAndUpdate({ roomId }, { canvasState });
      } catch (_) {}
    });

    // ─────────────── HOST PERMISSION MANAGEMENT ──────────────────
    socket.on('toggle-draw-permission', async ({ roomId, targetUserId, canDraw }) => {
      const { userId } = socket.data || {};
      // Only host can toggle permissions
      const isHost = await checkIsHost(roomId, userId);
      if (!isHost) return;

      if (canDraw) {
        drawPermissions[roomId]?.add(targetUserId);
      } else {
        drawPermissions[roomId]?.delete(targetUserId);
      }

      // Notify the target user
      const targetSocketId = findSocketByUserId(roomId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('draw-permission', { canDraw });
      }

      // Update user data in roomUsers
      if (roomUsers[roomId]) {
        Object.keys(roomUsers[roomId]).forEach(sid => {
          if (roomUsers[roomId][sid].userId === targetUserId) {
            roomUsers[roomId][sid].canDraw = canDraw;
          }
        });
      }

      broadcastPresence(io, roomId);
    });

    // ───────────────────────── CHAT ─────────────────────────────
    socket.on('chat-message', async ({ roomId, userId, userName, message }) => {
      const timestamp = new Date();
      const msgObj = { user: userId, userName, message, timestamp };
      try {
        await Room.findOneAndUpdate(
          { roomId },
          { $push: { chatMessages: msgObj } }
        );
      } catch (_) {}
      io.to(roomId).emit('chat-message', { userName, message, timestamp });
    });

    // ─────────────────── WEBRTC SCREEN SHARE ────────────────────
    socket.on('webrtc-offer', ({ roomId, offer, to }) => {
      io.to(to).emit('webrtc-offer', { offer, from: socket.id });
    });

    socket.on('webrtc-answer', ({ answer, to }) => {
      io.to(to).emit('webrtc-answer', { answer, from: socket.id });
    });

    socket.on('webrtc-ice-candidate', ({ candidate, to }) => {
      io.to(to).emit('webrtc-ice-candidate', { candidate, from: socket.id });
    });

    // ─────────────────── VIDEO CALL ──────────────────────────────
    socket.on('video-join', ({ roomId }) => {
      if (!videoCallUsers[roomId]) videoCallUsers[roomId] = new Set();
      // Send ALL room members to the joiner so they can send offers to everyone
      const allPeers = [];
      if (roomUsers[roomId]) {
        for (const [sid, userData] of Object.entries(roomUsers[roomId])) {
          if (sid !== socket.id) {
            allPeers.push({ socketId: sid, userId: userData.userId, userName: userData.userName });
          }
        }
      }
      console.log(`[VIDEO] ${socket.id} joining video in room ${roomId}. Sending ${allPeers.length} room members`);
      socket.emit('video-peers', { peers: allPeers });
      // Track this user as in video call
      videoCallUsers[roomId].add(socket.id);
      // Tell everyone else in the room
      socket.to(roomId).emit('video-join', { from: socket.id, userId: socket.data?.userId, userName: socket.data?.userName });
    });
    socket.on('video-offer', ({ offer, to }) => {
      console.log(`[VIDEO] Relaying offer from ${socket.id} to ${to}`);
      io.to(to).emit('video-offer', { offer, from: socket.id });
    });
    socket.on('video-answer', ({ answer, to }) => {
      console.log(`[VIDEO] Relaying answer from ${socket.id} to ${to}`);
      io.to(to).emit('video-answer', { answer, from: socket.id });
    });
    socket.on('video-ice-candidate', ({ candidate, to }) => {
      io.to(to).emit('video-ice-candidate', { candidate, from: socket.id });
    });
    socket.on('video-leave', ({ roomId }) => {
      videoCallUsers[roomId]?.delete(socket.id);
      socket.to(roomId).emit('video-leave', { from: socket.id });
    });

    // ─────────────────────── FILE SHARE ─────────────────────────
    socket.on('file-share', async ({ roomId, fileName, fileUrl, userId }) => {
      try {
        await Room.findOneAndUpdate(
          { roomId },
          { $push: { sharedFiles: { fileName, fileUrl, uploadedBy: userId } } }
        );
      } catch (_) {}
      io.to(roomId).emit('file-share', { fileName, fileUrl, userId });
    });

    // ─────────────────── BACKGROUND COLOR SYNC ─────────────────────
    socket.on('bg-color-change', async ({ roomId, bgColor }) => {
      const { userId } = socket.data || {};
      const isHost = await checkIsHost(roomId, userId);
      if (!isHost) return;
      socket.to(roomId).emit('bg-color-change', { bgColor });
    });

    // ─────────────────── SESSION RECORDING ───────────────────────
    socket.on('recording-started', ({ roomId, userName }) => {
      socket.to(roomId).emit('recording-started', { userName });
    });
    socket.on('recording-stopped', ({ roomId }) => {
      socket.to(roomId).emit('recording-stopped');
    });

    // ───────────────────────── LEAVE ────────────────────────────
    socket.on('leave-room', ({ roomId }) => {
      handleDisconnect(socket, io, roomId);
    });

    socket.on('disconnect', () => {
      const { roomId } = socket.data || {};
      if (roomId) handleDisconnect(socket, io, roomId);
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

async function checkIsHost(roomId, userId) {
  try {
    const room = await Room.findOne({ roomId });
    return room && String(room.host) === String(userId);
  } catch {
    return false;
  }
}

function findSocketByUserId(roomId, userId) {
  if (!roomUsers[roomId]) return null;
  for (const [socketId, data] of Object.entries(roomUsers[roomId])) {
    if (data.userId === userId) return socketId;
  }
  return null;
}

function broadcastPresence(io, roomId) {
  io.to(roomId).emit('presence-update', Object.values(roomUsers[roomId] || {}));
}

function handleDisconnect(socket, io, roomId) {
  if (roomUsers[roomId]) {
    const user = roomUsers[roomId][socket.id];
    delete roomUsers[roomId][socket.id];
    if (Object.keys(roomUsers[roomId]).length === 0) {
      delete roomUsers[roomId];
      delete drawPermissions[roomId];
      delete videoCallUsers[roomId];
    }
    broadcastPresence(io, roomId);
    if (user) io.to(roomId).emit('user-left', { userName: user.userName });
  }
  // Remove from video call tracking
  if (videoCallUsers[roomId]) {
    videoCallUsers[roomId].delete(socket.id);
    io.to(roomId).emit('video-leave', { from: socket.id });
  }
  socket.leave(roomId);
}

module.exports = socketHandler;
