export default function PresencePanel({ users, hostId, isHost, currentUserId, onTogglePermission }) {
  return (
    <div className="presence-panel">
      <ul className="presence-list">
        {users.map((u, i) => (
          <li key={u.userId || i} className="presence-item">
            <div
              className="avatar"
              style={{ background: stringToColor(u.userName || 'U') }}
            >
              {(u.userName || 'U')[0].toUpperCase()}
              <span className="status-dot" />
            </div>
            <span className="presence-name">{u.userName}</span>
            {u.userId === hostId && (
              <span className="host-badge">Host</span>
            )}
            {/* Host can toggle draw permission for non-host users */}
            {isHost && u.userId !== currentUserId && u.userId !== hostId && (
              <button
                className={`perm-toggle ${u.canDraw !== false ? 'allowed' : 'blocked'}`}
                onClick={() => onTogglePermission(u.userId, !u.canDraw)}
                title={u.canDraw !== false ? 'Disable drawing' : 'Enable drawing'}
              >
                <span className="icon" style={{ fontSize: '16px' }}>
                  {u.canDraw !== false ? 'edit' : 'edit_off'}
                </span>
              </button>
            )}
            {/* Non-host users see their own draw status */}
            {!isHost && u.userId === currentUserId && u.canDraw === false && (
              <span className="perm-badge blocked">
                <span className="icon" style={{ fontSize: '14px' }}>edit_off</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${hash % 360}, 55%, 45%)`;
}
