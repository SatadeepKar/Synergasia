import { useState, useEffect, useRef } from 'react';

export default function ChatPanel({ messages, onSend, user }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="icon">forum</span>
            <p>No messages yet. Say hi!</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`chat-msg ${msg.userName === user.name ? 'own' : ''}`}
          >
            <span className="chat-sender">{msg.userName}</span>
            <span className="chat-bubble">{msg.message}</span>
            <span className="chat-time">{formatTime(msg.timestamp)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendMessage} className="chat-form">
        <input
          id="chat-input"
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button id="chat-send" type="submit" className="btn-primary">
          <span className="icon">send</span>
        </button>
      </form>
    </div>
  );
}
