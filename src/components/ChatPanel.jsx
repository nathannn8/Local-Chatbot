import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { sendMessage } from '../api';
import { Send, Bot, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#6c5ce7', '#a29bfe', '#81ecec', '#74b9ff', '#55efc4', '#dfe6e9'];

const ChartRenderer = ({ data }) => {
  if (!data) return null;
  const { chart_type, labels, values, title } = data;
  
  if (!labels || !values) return null;

  const chartData = labels.map((label, index) => ({
    name: label,
    value: values[index]
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: '#22222f', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px', zIndex: 1000 }}>
          <p style={{ margin: 0, color: '#e8e8f0', fontSize: '13px' }}>{`${payload[0].name || label}: ${payload[0].value}`}</p>
        </div>
      );
    }
    return null;
  };

  const renderTitle = () => {
    if (!title) return null;
    return (
      <div style={{ textAlign: 'center', marginBottom: '16px', fontWeight: '600', color: '#e8e8f0' }}>
        {title}
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: 300, marginTop: '20px' }}>
      {renderTitle()}
      <ResponsiveContainer width="100%" height="80%">
        {chart_type === 'pie' ? (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        ) : chart_type === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" stroke="#9898b0" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9898b0" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
            <Bar dataKey="value" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : chart_type === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" stroke="#9898b0" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9898b0" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="value" stroke="#6c5ce7" strokeWidth={3} dot={{ r: 4, fill: '#a29bfe' }} activeDot={{ r: 6 }} />
          </LineChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
};

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
    // Ensure blank lines before tables to prevent paragraphs from being merged into table headers
    const lines = cleaned.split('\n');
    let formatted = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isTableLine = line.trim().startsWith('|');
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const prevIsTable = prevLine.startsWith('|');

      // If current line starts a table, but previous line wasn't empty or a table, insert a blank line
      if (isTableLine && !prevIsTable && prevLine !== '') {
        formatted.push('');
      }
      // If we are strictly enforcing that only lines starting with '|' render as tables,
      // we could manipulate lines here, but the blank line fix prevents 99% of paragraph merging issues.
      formatted.push(line);
    }
    
    return formatted.join('\n').trim();
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
      console.log('AI Response Data:', data);
      
      if (!isMounted.current) return;
      
      // Prioritize the 'reply' field as requested
      const rawContent = data && data.reply ? data.reply : (data && (data.response || data.message)) || "";
      const cleanedContent = cleanReply(rawContent);

      const aiMsg = {
        id: Date.now() + 1,
        role: 'ai',
        content: cleanedContent || "The AI could not provide a specific answer at this time.",
        chart: data?.chart || null,
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {String(msg.content || '')}
                    </ReactMarkdown>
                    {msg.chart && <ChartRenderer data={msg.chart} />}
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
