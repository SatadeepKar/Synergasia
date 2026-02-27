import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { saveAs } from 'file-saver';
import axios from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Canvas from '../components/Canvas';
import Toolbar from '../components/Toolbar';
import ChatPanel from '../components/ChatPanel';
import PresencePanel from '../components/PresencePanel';
import VideoCall, { VideoReceiver } from '../components/VideoCall';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Whiteboard() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunks = useRef([]);
  const screenPeerConnections = useRef({});

  // ── Room state
  const [room, setRoom] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [notification, setNotification] = useState('');

  // ── Chat messages (always collected, even when panel is closed)
  const [chatMessages, setChatMessages] = useState([]);

  // ── Tool state
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#1e1e1e');
  const [brushSize, setBrushSize] = useState(3);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [isRecording, setIsRecording] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);

  // ── Permissions
  const [canDraw, setCanDraw] = useState(true);

  // ── Zoom
  const [zoom, setZoom] = useState(100);

  // ── Side panel
  const [sidePanel, setSidePanel] = useState(null);

  // ── Video call
  const [isInCall, setIsInCall] = useState(false);

  const notify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  };

  // ── Fetch room data
  useEffect(() => {
    axios.get(`/api/rooms/${roomId}`)
      .then(({ data }) => {
        setRoom(data);
        setSharedFiles(data.sharedFiles || []);
      })
      .catch(() => navigate('/'));
  }, [roomId, navigate]);

  // ── Connect socket — chat listeners live HERE so messages are never lost
  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket'] });
    setSocket(s);

    s.on('connect', () => {
      s.emit('join-room', {
        roomId,
        userId: user._id,
        userName: user.name,
      });
    });

    // Canvas
    s.on('canvas-state-sync', (state) => {
      if (state && state !== '[]') canvasRef.current?.loadState(state);
    });

    // Presence
    s.on('presence-update', (users) => setOnlineUsers(users));
    s.on('user-joined', ({ userName }) => notify(`${userName} joined`));
    s.on('user-left', ({ userName }) => notify(`${userName} left`));

    // Chat — ALWAYS listen, regardless of panel state
    s.on('chat-history', (history) => {
      setChatMessages(history.map((m) => ({
        userName: m.userName,
        message: m.message,
        timestamp: m.timestamp,
      })));
    });
    s.on('chat-message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    // Files
    s.on('file-share', ({ fileName, fileUrl }) => {
      setSharedFiles((prev) => [...prev, { fileName, fileUrl }]);
      notify(`${fileName} shared`);
    });
    s.on('recording-started', ({ userName }) =>
      notify(`${userName} started recording`));

    // Permissions
    s.on('draw-permission', ({ canDraw: allowed }) => {
      setCanDraw(allowed);
      if (!allowed) notify('Drawing disabled by host');
      else notify('Drawing enabled');
    });
    s.on('draw-blocked', ({ message }) => {
      notify(message || 'Drawing not allowed');
    });

    // Background colour sync from host
    s.on('bg-color-change', ({ bgColor: newBg }) => {
      setBgColor(newBg);
    });

    // Old webrtc-* screen share events removed — screen share now uses video-* events
    // which are handled by the always-mounted VideoReceiver component

    return () => s.disconnect();
  }, [roomId, user]);

  const handleUndo = useCallback(() => {
    if (!canDraw) { notify('Drawing disabled by host'); return; }
    canvasRef.current?.undo();
    socket?.emit('undo', { roomId });
  }, [roomId, canDraw, socket]);

  const handleRedo = useCallback(() => {
    if (!canDraw) { notify('Drawing disabled by host'); return; }
    canvasRef.current?.redo();
    socket?.emit('redo', { roomId });
  }, [roomId, canDraw, socket]);

  const handleClear = useCallback(() => {
    socket?.emit('clear-board', { roomId, userId: user._id });
  }, [roomId, user, socket]);

  // ── Save: use Canvas ref to get full composited image
  const handleSave = useCallback(() => {
    const dataUrl = canvasRef.current?.getDataURL();
    if (dataUrl) {
      saveAs(dataUrl, `whiteboard-${roomId}-${Date.now()}.png`);
      notify('Snapshot saved!');
    }
  }, [roomId]);

  const handleScreenShare = useCallback(async () => {
    if (isSharingScreen) {
      setIsSharingScreen(false);
      Object.values(screenPeerConnections.current).forEach((pc) => pc.close());
      screenPeerConnections.current = {};
      socket?.emit('video-leave', { roomId });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setIsSharingScreen(true);

      // Use video signaling: get all room members via socket IDs
      const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

      // Listen for answers and ICE candidates for screen share PCs
      const onAnswer = async ({ answer, from }) => {
        const pc = screenPeerConnections.current[from];
        if (pc) {
          try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); } catch {}
        }
      };
      const onIce = ({ candidate, from }) => {
        const pc = screenPeerConnections.current[from];
        if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      };
      socket.on('video-answer', onAnswer);
      socket.on('video-ice-candidate', onIce);

      // When we get the room members list, create offers to all of them
      const onPeers = async ({ peers: peerList }) => {
        for (const peer of peerList) {
          const pc = new RTCPeerConnection({ iceServers: ICE });
          screenPeerConnections.current[peer.socketId] = pc;
          stream.getTracks().forEach(t => pc.addTrack(t, stream));
          pc.onicecandidate = (e) => {
            if (e.candidate) socket.emit('video-ice-candidate', { candidate: e.candidate, to: peer.socketId });
          };
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('video-offer', { offer, to: peer.socketId });
          } catch {}
        }
      };
      socket.once('video-peers', onPeers);
      socket.emit('video-join', { roomId });

      stream.getVideoTracks()[0].onended = () => {
        setIsSharingScreen(false);
        Object.values(screenPeerConnections.current).forEach((pc) => pc.close());
        screenPeerConnections.current = {};
        socket?.emit('video-leave', { roomId });
        socket.off('video-answer', onAnswer);
        socket.off('video-ice-candidate', onIce);
      };
    } catch {
      notify('Screen share cancelled');
    }
  }, [isSharingScreen, roomId, socket]);

  const handleFileShare = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      socket?.emit('file-share', {
        roomId, fileName: data.fileName, fileUrl: data.fileUrl, userId: user._id,
      });
      notify(`${data.fileName} shared`);
    } catch {
      notify('File upload failed');
    }
  }, [roomId, user, socket]);

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = document.getElementById('main-canvas')?.captureStream(30);
      if (!stream) { notify('Recording not supported'); return; }
      recordedChunks.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        saveAs(blob, `session-${roomId}-${Date.now()}.webm`);
        notify('Recording saved!');
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      socket?.emit('recording-started', { roomId, userName: user.name });
    } catch {
      notify('Could not start recording');
    }
  }, [isRecording, roomId, user, socket]);

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => notify('Room ID copied!'));
  };

  // ── Host permission toggle
  const handleTogglePermission = useCallback((targetUserId, allowed) => {
    socket?.emit('toggle-draw-permission', {
      roomId,
      targetUserId,
      canDraw: allowed,
    });
  }, [roomId, socket]);

  // ── Zoom
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 10, 30)), []);
  const zoomReset = useCallback(() => setZoom(100), []);

  // Global wheel handler for pinch-to-zoom
  useEffect(() => {
    const handleGlobalWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Prevent browser zoom
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    // must be non-passive to preventDefault
    document.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleGlobalWheel);
  }, [zoomIn, zoomOut]);

  // ── Chat — send message (parent handles socket, not ChatPanel)
  const sendChatMessage = useCallback((message) => {
    socket?.emit('chat-message', {
      roomId,
      userId: user._id,
      userName: user.name,
      message,
    });
  }, [roomId, user, socket]);

  const isHost = room && user && String(room.host?._id) === String(user._id);

  // When host changes bg color, broadcast to everyone
  const handleBgColorChange = useCallback((newBg) => {
    setBgColor(newBg);
    if (isHost && socket) {
      socket.emit('bg-color-change', { roomId, bgColor: newBg });
    }
  }, [isHost, socket, roomId]);

  const togglePanel = (name) => setSidePanel((prev) => prev === name ? null : name);

  return (
    <div className="exc-page">
      {/* ═══ TOP LEFT: Room info ═══ */}
      <div className="exc-top-left">
        <button className="exc-tool" onClick={() => navigate('/')} data-tooltip="Back">
          <span className="icon">arrow_back</span>
        </button>
        <div className="exc-room-name">
          <span>{room?.name || '...'}</span>
          <button className="exc-room-id" onClick={handleCopyRoomId} title="Copy ID">
            <span className="icon" style={{ fontSize: '13px' }}>content_copy</span>
            {roomId}
          </button>
        </div>
      </div>

      {/* ═══ TOP RIGHT: Panels + users ═══ */}
      <div className="exc-top-right">
        <div className="exc-users">
          {onlineUsers.slice(0, 4).map((u, i) => (
            <div
              key={u.userId || i}
              className="exc-user-avatar"
              style={{ background: stringToColor(u.userName || 'U') }}
              title={u.userName}
            >
              {(u.userName || 'U')[0].toUpperCase()}
            </div>
          ))}
          {onlineUsers.length > 4 && (
            <div className="exc-user-avatar exc-user-more">+{onlineUsers.length - 4}</div>
          )}
        </div>
        <button className={`exc-tool ${sidePanel === 'chat' ? 'active' : ''}`} onClick={() => togglePanel('chat')} data-tooltip="Chat">
          <span className="icon">chat</span>
        </button>
        <button className={`exc-tool ${sidePanel === 'people' ? 'active' : ''}`} onClick={() => togglePanel('people')} data-tooltip="People">
          <span className="icon">group</span>
        </button>
        <button className={`exc-tool ${sidePanel === 'files' ? 'active' : ''}`} onClick={() => togglePanel('files')} data-tooltip="Files">
          <span className="icon">folder</span>
        </button>
        <button className={`exc-tool ${isInCall ? 'active' : ''}`} onClick={() => setIsInCall(v => !v)} data-tooltip={isInCall ? 'Leave Call' : 'Video Call'}>
          <span className="icon">{isInCall ? 'call_end' : 'videocam'}</span>
        </button>
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <Toolbar
        tool={tool} setTool={setTool}
        color={color} setColor={setColor}
        brushSize={brushSize} setBrushSize={setBrushSize}
        bgColor={bgColor} setBgColor={handleBgColorChange}
        onUndo={handleUndo} onRedo={handleRedo}
        onClear={handleClear} onSave={handleSave}
        onRecordToggle={handleRecordToggle} isRecording={isRecording}
        onScreenShare={handleScreenShare} isSharingScreen={isSharingScreen}
        onFileShare={handleFileShare} isHost={isHost}
        canDraw={canDraw}
      />

      {/* ═══ PERMISSION BANNER ═══ */}
      {!canDraw && (
        <div className="exc-permission-banner">
          <span className="icon">block</span>
          Drawing disabled — ask the host to enable your access
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {notification && (
        <div className="toast">
          <span className="icon">info</span>
          {notification}
        </div>
      )}

      {/* ═══ CANVAS (full screen, zoom handled by Canvas.jsx transform) ═══ */}
      <div id="exc-canvas-area" className="exc-canvas-area">
        <Canvas
          ref={canvasRef}
          socket={socket}
          roomId={roomId}
          tool={canDraw ? tool : 'blocked'}
          color={color}
          brushSize={brushSize}
          bgColor={bgColor}
          zoom={zoom}
        />
      </div>

      {/* ═══ VIDEO CALL ═══ */}
      {/* Always receive incoming video from others */}
      {socket && !isInCall && <VideoReceiver socket={socket} roomId={roomId} />}
      {/* Full-screen call when user shares their own camera */}
      {isInCall && (
        <VideoCall
          socket={socket}
          roomId={roomId}
          user={user}
          onLeave={() => setIsInCall(false)}
        />
      )}

      {/* ═══ BOTTOM RIGHT: Zoom controls ═══ */}
      <div className="exc-bottom-right">
        <button className="exc-tool" onClick={zoomOut} data-tooltip="Zoom out">
          <span className="icon">remove</span>
        </button>
        <span className="exc-zoom-label" onClick={zoomReset} title="Reset zoom">{zoom}%</span>
        <button className="exc-tool" onClick={zoomIn} data-tooltip="Zoom in">
          <span className="icon">add</span>
        </button>
      </div>

      {/* ═══ SIDE PANEL ═══ */}
      {sidePanel && (
        <div className="exc-side-panel">
          <div className="exc-side-header">
            <h3>
              <span className="icon">
                {sidePanel === 'chat' ? 'chat' : sidePanel === 'people' ? 'group' : 'folder'}
              </span>
              {sidePanel === 'chat' ? 'Chat' : sidePanel === 'people' ? `People (${onlineUsers.length})` : 'Files'}
            </h3>
            <button className="exc-tool" onClick={() => setSidePanel(null)}>
              <span className="icon">close</span>
            </button>
          </div>
          {sidePanel === 'chat' && (
            <ChatPanel
              messages={chatMessages}
              onSend={sendChatMessage}
              user={user}
            />
          )}
          {sidePanel === 'people' && (
            <PresencePanel
              users={onlineUsers}
              hostId={room?.host?._id}
              isHost={isHost}
              currentUserId={user._id}
              onTogglePermission={handleTogglePermission}
            />
          )}
          {sidePanel === 'files' && (
            <div className="files-panel">
              {sharedFiles.length === 0 ? (
                <div className="empty-state">
                  <span className="icon">cloud_upload</span>
                  <p>No files shared yet.</p>
                </div>
              ) : (
                <ul className="file-list">
                  {sharedFiles.map((f, i) => (
                    <li key={i} className="file-item">
                      <span className="icon">description</span>
                      <a href={f.fileUrl} target="_blank" rel="noreferrer">{f.fileName}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 55%, 45%)`;
}
