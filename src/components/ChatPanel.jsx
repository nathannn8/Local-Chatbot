import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { sendMessage } from '../api';
import { Send, Bot, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ChatPanel() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U';

  useEffect(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  }, [messages, isTyping]);

  const cleanReply = (text) => {
    if (!text || typeof text !== 'string') return text;
    // Strip TOOLCALL>[...] or similar patterns
    let cleaned = text.replace(/TOOLCALL>\[.*?\]/gs, '');
    // Strip common XML tool tags if any
    cleaned = cleaned.replace(/<tool_call>.*?<\/tool_call>/gs, '');
    cleaned = cleaned.replace(/<thought>.*?<\/thought>/gs, '');
    cleaned = cleaned.replace(/<tool_result>.*?<\/tool_result>/gs, '');
    return cleaned.trim();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const data = await sendMessage(text, user?.token);
      if (!isMounted.current) return;
      
      // Prioritize the 'reply' field as requested
      const rawContent = data.reply || data.response || data.message || "";
      const cleanedContent = cleanReply(rawContent);

      const aiMsg = {
        id: Date.now() + 1,
        role: 'ai',
        content: cleanedContent || "The AI provided an empty response.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      if (!isMounted.current) return;
      
      const errMsg = {
        id: Date.now() + 1,
        role: 'ai',
        content: `Error: ${err.message || "Failed to get AI response"}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      if (isMounted.current) {
        setIsTyping(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="chat-main">
      {/* Header */}
      <div className="chat-header">
        <div className="ai-avatar">
          <Bot size={20} color="#fff" />
        </div>
        <div className="ai-info">
          <h3>AI Assistant</h3>
          <div className="status">Online</div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 && !isTyping && (
          <div className="empty-state">
            <div className="empty-icon">
              <MessageSquare size={32} />
            </div>
            <h3>Start a Conversation</h3>
            <p>
              Send a message to begin chatting with the AI assistant.
              You can also upload PDFs in the sidebar for context.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
            <div className="msg-avatar">
              {msg.role === 'user' ? initials : <Bot size={14} />}
            </div>
            <div>
              <div className="msg-bubble">
                {msg.role === 'ai' ? (
                  <div className="md-content">
                    <ReactMarkdown>
                      {String(msg.content || '')}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
              <div className="msg-time">{msg.time}</div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="typing-indicator">
            <div className="msg-avatar" style={{ background: 'var(--bg-elevated)', color: 'var(--accent-secondary)', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
              <Bot size={14} />
            </div>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <div className="chat-input-inner">
          <input
            type="text"
            placeholder="Type your message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            title="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
