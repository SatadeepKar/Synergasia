import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // 'create' | 'join'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    axios.get('/api/rooms').then(({ data }) => setRooms(data)).catch(() => {});
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    if (!roomName.trim()) return setError('Room name is required');
    try {
      setLoading(true);
      const { data } = await axios.post('/api/rooms/create', { name: roomName });
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setError('');
    if (!joinId.trim()) return setError('Room ID is required');
    try {
      setLoading(true);
      await axios.post(`/api/rooms/join/${joinId.trim().toUpperCase()}`);
      navigate(`/room/${joinId.trim().toUpperCase()}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Room not found');
    } finally {
      setLoading(false);
    }
  };

  const hostedRooms = rooms.filter(r => String(r.host._id) === user._id);
  const joinedRooms = rooms.filter(r => String(r.host._id) !== user._id);
  const totalMembers = rooms.reduce((sum, r) => sum + (r.participants?.length || 0), 0);

  const filteredRooms = rooms.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.roomId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 55%, 45%)`;
  };

  const timeSince = (date) => {
    const now = new Date();
    const d = new Date(date);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const features = [
    { icon: 'brush', title: 'Real-Time Drawing', desc: 'Freehand, shapes, text, eraser & laser pointer with live sync across all users.', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
    { icon: 'videocam', title: 'Video Calls', desc: 'Peer-to-peer WebRTC video calling built right into every whiteboard room.', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
    { icon: 'screen_share', title: 'Screen Sharing', desc: 'Share your screen with the whole room for presentations and demos.', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    { icon: 'chat', title: 'Live Chat', desc: 'In-room messaging with persistent chat history so nothing gets lost.', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    { icon: 'admin_panel_settings', title: 'Host Controls', desc: 'Toggle draw permissions per user, clear the board, and manage the session.', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    { icon: 'fiber_smart_record', title: 'Session Recording', desc: 'Record your whiteboard sessions as video and download them locally.', color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
    { icon: 'upload_file', title: 'File Sharing', desc: 'Upload and share files with all room participants in real time.', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    { icon: 'palette', title: 'Canvas Backgrounds', desc: 'Pick canvas background colors — host changes sync to everyone instantly.', color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  ];

  return (
    <div className="dash">
      {/* ═══ HERO ═══ */}
      <section className="dash-hero">
        <div className="dash-hero-inner">
          <div className="dash-hero-left">
            <div className="dash-avatar" style={{ background: `linear-gradient(135deg, ${stringToColor(user?.name || 'U')}, ${stringToColor((user?.name || 'U') + 'x')})` }}>
              {getInitials(user?.name)}
            </div>
            <div>
              <p className="dash-greeting">{getGreeting()},</p>
              <h1 className="dash-name">{user?.name}</h1>
            </div>
          </div>
          <div className="dash-stats-row">
            <div className="dash-stat-pill">
              <span className="icon">space_dashboard</span>
              <strong>{rooms.length}</strong> Rooms
            </div>
            <div className="dash-stat-pill">
              <span className="icon">shield</span>
              <strong>{hostedRooms.length}</strong> Hosted
            </div>
            <div className="dash-stat-pill">
              <span className="icon">group</span>
              <strong>{totalMembers}</strong> People
            </div>
            <div className="dash-stat-pill">
              <span className="icon">login</span>
              <strong>{joinedRooms.length}</strong> Joined
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CREATE & JOIN — SIDE BY SIDE ═══ */}
      <section className="dash-actions-row">
        <div className="dash-action-card dash-action-create">
          <div className="dash-action-header">
            <div className="dash-action-icon create-icon">
              <span className="icon">add_circle</span>
            </div>
            <div>
              <h2>Create Room</h2>
              <p>Start a new collaborative whiteboard session</p>
            </div>
          </div>
          {error && activeAction === 'create' && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              <span className="icon" style={{ fontSize: '17px' }}>error</span>
              {error}
            </div>
          )}
          <form onSubmit={handleCreateRoom} className="dash-action-form">
            <input
              type="text"
              placeholder="Room name, e.g. Design Sprint #1"
              value={roomName}
              onChange={(e) => { setRoomName(e.target.value); setActiveAction('create'); }}
              required
            />
            <button type="submit" className="dash-btn dash-btn-create" disabled={loading && activeAction === 'create'}>
              {loading && activeAction === 'create' ? (
                <><span className="btn-spinner" /> Creating...</>
              ) : (
                <><span className="icon">rocket_launch</span> Create</>
              )}
            </button>
          </form>
        </div>

        <div className="dash-action-card dash-action-join">
          <div className="dash-action-header">
            <div className="dash-action-icon join-icon">
              <span className="icon">link</span>
            </div>
            <div>
              <h2>Join Room</h2>
              <p>Enter a Room ID to join an existing session</p>
            </div>
          </div>
          {error && activeAction === 'join' && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              <span className="icon" style={{ fontSize: '17px' }}>error</span>
              {error}
            </div>
          )}
          <form onSubmit={handleJoinRoom} className="dash-action-form">
            <input
              type="text"
              placeholder="Room ID, e.g. AB12CD34"
              value={joinId}
              onChange={(e) => { setJoinId(e.target.value); setActiveAction('join'); }}
              required
            />
            <button type="submit" className="dash-btn dash-btn-join" disabled={loading && activeAction === 'join'}>
              {loading && activeAction === 'join' ? (
                <><span className="btn-spinner" /> Joining...</>
              ) : (
                <><span className="icon">meeting_room</span> Join</>
              )}
            </button>
          </form>
        </div>
      </section>

      {/* ═══ MY ROOMS ═══ */}
      <section className="dash-rooms-section">
        <div className="dash-section-header">
          <h2>
            <span className="icon" style={{ color: 'var(--accent)' }}>space_dashboard</span>
            My Rooms
            {rooms.length > 0 && <span className="dash-count-badge">{rooms.length}</span>}
          </h2>
          {rooms.length > 3 && (
            <div className="dash-search">
              <span className="icon">search</span>
              <input
                type="text"
                placeholder="Search rooms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
        </div>

        {filteredRooms.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon">
              <span className="icon">meeting_room</span>
            </div>
            {searchTerm ? (
              <p>No rooms matching &ldquo;{searchTerm}&rdquo;</p>
            ) : (
              <>
                <h3>No rooms yet</h3>
                <p>Create your first room above to get started!</p>
              </>
            )}
          </div>
        ) : (
          <div className="dash-rooms-grid">
            {filteredRooms.map((room, index) => {
              const isRoomHost = String(room.host._id) === user._id;
              return (
                <div
                  key={room._id}
                  className="dash-room-card"
                  onClick={() => navigate(`/room/${room.roomId}`)}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="dash-room-top">
                    <div className={`dash-room-icon ${isRoomHost ? 'hosted' : 'joined'}`}>
                      <span className="icon">{isRoomHost ? 'palette' : 'brush'}</span>
                    </div>
                    <span className={`dash-room-badge ${isRoomHost ? 'host' : 'participant'}`}>
                      {isRoomHost ? 'Host' : 'Member'}
                    </span>
                  </div>
                  <h3 className="dash-room-name">{room.name}</h3>
                  <p className="dash-room-id">
                    <span className="icon" style={{ fontSize: '12px' }}>tag</span>
                    {room.roomId}
                  </p>
                  <div className="dash-room-footer">
                    <span className="dash-room-meta">
                      <span className="icon">group</span>
                      {room.participants?.length || 0}
                    </span>
                    {room.updatedAt && (
                      <span className="dash-room-meta muted">
                        <span className="icon">schedule</span>
                        {timeSince(room.updatedAt)}
                      </span>
                    )}
                    <span className="dash-room-arrow">
                      <span className="icon">arrow_forward</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="dash-features-section">
        <div className="dash-section-header">
          <h2>
            <span className="icon" style={{ color: '#8b5cf6' }}>auto_awesome</span>
            What You Can Do
          </h2>
          <p className="dash-section-subtitle">Everything you need for real-time team collaboration</p>
        </div>
        <div className="dash-features-grid">
          {features.map((f, i) => (
            <div key={i} className="dash-feat-card" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="dash-feat-icon" style={{ background: f.bg, color: f.color }}>
                <span className="icon">{f.icon}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="dash-footer">
        <p>Synergasia &mdash; Real-time collaborative whiteboard</p>
      </footer>
    </div>
  );
}
