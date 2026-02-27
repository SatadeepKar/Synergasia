import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/*  VideoCall: Full-screen view + camera sharing + receives remote video
    VideoReceiver: Always-on component that receives remote video (no camera required)
*/

// ── ALWAYS-MOUNTED: receives remote video even if this user hasn't shared ──
export function VideoReceiver({ socket, roomId }) {
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> { stream, userName }

  const createReceiverPC = useCallback((remoteSocketId) => {
    if (peersRef.current[remoteSocketId]?.pc) return peersRef.current[remoteSocketId].pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket?.emit('video-ice-candidate', { candidate: e.candidate, to: remoteSocketId });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (peersRef.current[remoteSocketId]) {
        peersRef.current[remoteSocketId].stream = stream;
      }
      setRemoteStreams(prev => ({
        ...prev,
        [remoteSocketId]: {
          stream,
          userName: peersRef.current[remoteSocketId]?.userName || 'User',
        }
      }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(remoteSocketId);
      }
    };

    peersRef.current[remoteSocketId] = {
      ...(peersRef.current[remoteSocketId] || {}),
      pc,
    };
    return pc;
  }, [socket]);

  const removePeer = useCallback((socketId) => {
    const peer = peersRef.current[socketId];
    if (peer?.pc) try { peer.pc.close(); } catch {}
    delete peersRef.current[socketId];
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[socketId];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    // Someone is offering us their video stream
    const onVideoOffer = async ({ offer, from }) => {
      const pc = createReceiverPC(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        // Create answer (we don't add local tracks — receive only)
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video-answer', { answer, to: from });
      } catch (err) {
        console.error('[VR] Failed to handle offer:', err);
      }
    };

    const onVideoAnswer = async ({ answer, from }) => {
      const peer = peersRef.current[from];
      if (peer?.pc) {
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch {}
      }
    };

    const onVideoIce = ({ candidate, from }) => {
      const peer = peersRef.current[from];
      if (peer?.pc && candidate) {
        peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    };

    const onVideoJoin = ({ from, userName }) => {
      // Note that someone joined — they'll send us an offer
      peersRef.current[from] = {
        ...(peersRef.current[from] || {}),
        userName: userName || 'User',
      };
    };

    const onVideoLeave = ({ from }) => {
      removePeer(from);
    };

    socket.on('video-offer', onVideoOffer);
    socket.on('video-answer', onVideoAnswer);
    socket.on('video-ice-candidate', onVideoIce);
    socket.on('video-join', onVideoJoin);
    socket.on('video-leave', onVideoLeave);

    return () => {
      socket.off('video-offer', onVideoOffer);
      socket.off('video-answer', onVideoAnswer);
      socket.off('video-ice-candidate', onVideoIce);
      socket.off('video-join', onVideoJoin);
      socket.off('video-leave', onVideoLeave);
      // Clean up all peer connections
      Object.keys(peersRef.current).forEach(id => {
        try { peersRef.current[id]?.pc?.close(); } catch {}
      });
    };
  }, [socket, createReceiverPC, removePeer]);

  const entries = Object.entries(remoteStreams);
  const [expandedId, setExpandedId] = useState(null);
  if (entries.length === 0) return null;

  return (
    <>
      {/* Expanded overlay */}
      {expandedId && remoteStreams[expandedId] && (
        <div className="vr-expanded-overlay" onClick={() => setExpandedId(null)}>
          <div className="vr-expanded-container" onClick={e => e.stopPropagation()}>
            <ExpandedVideo stream={remoteStreams[expandedId].stream} userName={remoteStreams[expandedId].userName} />
            <button className="vr-expanded-close" onClick={() => setExpandedId(null)}>
              <span className="icon">close</span>
            </button>
          </div>
        </div>
      )}
      {/* Floating small tiles */}
      <div className="vr-floating-videos">
        {entries.map(([socketId, { stream, userName }]) => (
          <RemoteTile key={socketId} stream={stream} userName={userName} onClick={() => setExpandedId(socketId)} />
        ))}
      </div>
    </>
  );
}

function ExpandedVideo({ stream, userName }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <>
      <video ref={ref} autoPlay playsInline />
      <div className="vr-expanded-label">{userName || 'User'}</div>
    </>
  );
}

function RemoteTile({ stream, userName, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="vr-tile" onClick={onClick} title="Click to expand">
      <video ref={ref} autoPlay playsInline />
      <span className="vr-tile-name">{userName || 'User'}</span>
    </div>
  );
}


// ── VideoCall: opens full-screen, shares YOUR camera, and also receives ──
export default function VideoCall({ socket, roomId, user, onLeave }) {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({}); // socketId -> { pc, stream, userName }
  const [peers, setPeers] = useState({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Create peer connection that SENDS our video
  const createSenderPC = useCallback((remoteSocketId) => {
    if (peersRef.current[remoteSocketId]?.pc) return peersRef.current[remoteSocketId].pc;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add our camera tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket?.emit('video-ice-candidate', { candidate: e.candidate, to: remoteSocketId });
      }
    };

    // We may also receive their video back
    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      if (peersRef.current[remoteSocketId]) {
        peersRef.current[remoteSocketId].stream = remoteStream;
      }
      setPeers(prev => ({
        ...prev,
        [remoteSocketId]: {
          stream: remoteStream,
          userName: peersRef.current[remoteSocketId]?.userName || 'User',
        }
      }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(remoteSocketId);
      }
    };

    peersRef.current[remoteSocketId] = {
      ...(peersRef.current[remoteSocketId] || {}),
      pc,
    };
    return pc;
  }, [socket]);

  const removePeer = useCallback((socketId) => {
    const peer = peersRef.current[socketId];
    if (peer?.pc) try { peer.pc.close(); } catch {}
    delete peersRef.current[socketId];
    setPeers(prev => {
      const next = { ...prev };
      delete next[socketId];
      return next;
    });
  }, []);

  // Setup: get camera, set up listeners, emit video-join, create offers to existing peers
  useEffect(() => {
    if (!socket) return;
    let cancelled = false;

    const onVideoAnswer = async ({ answer, from }) => {
      const peer = peersRef.current[from];
      if (peer?.pc) {
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch {}
      }
    };

    const onVideoIce = ({ candidate, from }) => {
      const peer = peersRef.current[from];
      if (peer?.pc && candidate) {
        peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
    };

    // When we get the list of existing peers, send offers to all of them
    const onVideoPeers = async ({ peers: peerList }) => {
      for (const peer of peerList) {
        peersRef.current[peer.socketId] = {
          ...(peersRef.current[peer.socketId] || {}),
          userName: peer.userName || 'User',
        };
        const pc = createSenderPC(peer.socketId);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('video-offer', { offer, to: peer.socketId });
        } catch (err) {
          console.error('[VC] Failed to create offer:', err);
        }
      }
    };

    // When a new user joins the room, send them our video
    const onVideoJoin = async ({ from, userName }) => {
      if (!localStreamRef.current) return;
      peersRef.current[from] = {
        ...(peersRef.current[from] || {}),
        userName: userName || 'User',
      };
      const pc = createSenderPC(from);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('video-offer', { offer, to: from });
      } catch (err) {
        console.error('[VC] Failed to create offer to new peer:', err);
      }
    };

    // When we receive an offer (from another sharer), answer it
    const onVideoOffer = async ({ offer, from }) => {
      const pc = createSenderPC(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video-answer', { answer, to: from });
      } catch (err) {
        console.error('[VC] Failed to handle offer:', err);
      }
    };

    const onVideoLeave = ({ from }) => {
      removePeer(from);
    };

    // Set up listeners first
    socket.on('video-peers', onVideoPeers);
    socket.on('video-join', onVideoJoin);
    socket.on('video-offer', onVideoOffer);
    socket.on('video-answer', onVideoAnswer);
    socket.on('video-ice-candidate', onVideoIce);
    socket.on('video-leave', onVideoLeave);

    // Get camera then join
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        socket.emit('video-join', { roomId });
      })
      .catch(() => {
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
          .then(stream => {
            if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
            localStreamRef.current = stream;
            setCamOn(false);
            socket.emit('video-join', { roomId });
          })
          .catch(() => onLeave?.());
      });

    return () => {
      cancelled = true;
      socket.off('video-peers', onVideoPeers);
      socket.off('video-join', onVideoJoin);
      socket.off('video-offer', onVideoOffer);
      socket.off('video-answer', onVideoAnswer);
      socket.off('video-ice-candidate', onVideoIce);
      socket.off('video-leave', onVideoLeave);
      // Close all peer connections
      Object.keys(peersRef.current).forEach(id => {
        try { peersRef.current[id]?.pc?.close(); } catch {}
      });
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [socket, roomId, createSenderPC, removePeer]);

  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(prev => !prev);
  };
  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(prev => !prev);
  };
  const leaveCall = () => {
    socket?.emit('video-leave', { roomId });
    Object.keys(peersRef.current).forEach(id => {
      try { peersRef.current[id]?.pc?.close(); } catch {}
    });
    peersRef.current = {};
    setPeers({});
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    onLeave?.();
  };

  const peerEntries = Object.entries(peers);
  const totalVideos = 1 + peerEntries.length;

  const getGridClass = () => {
    if (totalVideos <= 1) return 'vc-grid-1';
    if (totalVideos <= 2) return 'vc-grid-2';
    if (totalVideos <= 4) return 'vc-grid-4';
    if (totalVideos <= 6) return 'vc-grid-6';
    return 'vc-grid-many';
  };

  if (showWhiteboard) {
    return (
      <div className="vc-floating-bar">
        <div className="vc-floating-left">
          <span className="vc-dot-live" />
          <span className="vc-floating-timer">{formatTime(callDuration)}</span>
          <span className="vc-floating-count">{totalVideos} in call</span>
        </div>
        <div className="vc-floating-actions">
          <button className={`vc-fab ${!micOn ? 'off' : ''}`} onClick={toggleMic}>
            <span className="icon">{micOn ? 'mic' : 'mic_off'}</span>
          </button>
          <button className={`vc-fab ${!camOn ? 'off' : ''}`} onClick={toggleCam}>
            <span className="icon">{camOn ? 'videocam' : 'videocam_off'}</span>
          </button>
          <button className="vc-fab" onClick={() => setShowWhiteboard(false)}>
            <span className="icon">open_in_full</span>
          </button>
          <button className="vc-fab end" onClick={leaveCall}>
            <span className="icon">call_end</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-fullscreen">
      <div className="vc-header">
        <div className="vc-header-left">
          <span className="vc-dot-live" />
          <span className="vc-header-title">Video Call</span>
          <span className="vc-header-timer">{formatTime(callDuration)}</span>
        </div>
        <div className="vc-header-right">
          <span className="vc-participant-count">
            <span className="icon" style={{ fontSize: 16 }}>group</span>
            {totalVideos}
          </span>
          <button className="vc-header-btn" onClick={() => setShowWhiteboard(true)} title="Back to whiteboard">
            <span className="icon">dashboard</span>
            <span>Whiteboard</span>
          </button>
        </div>
      </div>
      <div className={`vc-grid ${getGridClass()}`}>
        <div className="vc-tile">
          <video ref={localVideoRef} autoPlay muted playsInline />
          {!camOn && (
            <div className="vc-cam-off">
              <div className="vc-avatar">{(user?.name || 'Y')[0].toUpperCase()}</div>
            </div>
          )}
          <div className="vc-tile-bar">
            <span className="vc-tile-name">You</span>
            {!micOn && <span className="icon vc-muted-icon">mic_off</span>}
          </div>
        </div>
        {peerEntries.map(([socketId, peer]) => (
          <RemoteTile key={socketId} stream={peer.stream} userName={peer.userName} />
        ))}
      </div>
      <div className="vc-controls">
        <button className={`vc-ctl ${!micOn ? 'off' : ''}`} onClick={toggleMic}>
          <span className="icon">{micOn ? 'mic' : 'mic_off'}</span>
          <span className="vc-ctl-label">{micOn ? 'Mute' : 'Unmute'}</span>
        </button>
        <button className={`vc-ctl ${!camOn ? 'off' : ''}`} onClick={toggleCam}>
          <span className="icon">{camOn ? 'videocam' : 'videocam_off'}</span>
          <span className="vc-ctl-label">{camOn ? 'Stop Video' : 'Start Video'}</span>
        </button>
        <button className="vc-ctl end" onClick={leaveCall}>
          <span className="icon">call_end</span>
          <span className="vc-ctl-label">Leave</span>
        </button>
      </div>
    </div>
  );
}
