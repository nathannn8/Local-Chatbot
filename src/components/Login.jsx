import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../api';
import { authenticateUser } from '../userStore';
import { MessageSquare } from 'lucide-react';

export default function Login({ onSwitchToSignUp }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }
    setError('');
    setLoading(true);

    // Try local user store first
    try {
      authenticateUser(username, password);
      login({ username, token: 'local-token' });
      return;
    } catch {
      // Not found locally — fall through to backend
    }

    // Try backend API
    try {
      const data = await loginUser(username, password);
      login({ username, token: data.token || data.access_token || '' });
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        setError('No account found. Please sign up first.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <form className="login-card" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <MessageSquare size={28} style={{ color: '#6c5ce7' }} />
          <h1>Local Chat</h1>
        </div>
        <p className="subtitle">Sign in to start chatting with your AI assistant</p>

        {error && <div className="login-error">{error}</div>}

        <div className="input-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn-login" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="auth-switch">
          Don't have an account?{' '}
          <button type="button" onClick={onSwitchToSignUp}>Sign Up</button>
        </p>
      </form>
    </div>
  );
}
