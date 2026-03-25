import { useState } from 'react';
import { registerUser } from '../userStore';
import { UserPlus } from 'lucide-react';

export default function SignUp({ onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setLoading(true);
    try {
      registerUser(username.trim(), password);
      setSuccess('Account created! Redirecting to login…');
      setTimeout(() => onSwitchToLogin(), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <form className="login-card" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <UserPlus size={28} style={{ color: '#6c5ce7' }} />
          <h1>Create Account</h1>
        </div>
        <p className="subtitle">Sign up to get started with Local Chat AI</p>

        {error && <div className="login-error">{error}</div>}
        {success && <div className="login-success">{success}</div>}

        <div className="input-group">
          <label htmlFor="su-username">Username</label>
          <input
            id="su-username"
            type="text"
            placeholder="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>

        <div className="input-group">
          <label htmlFor="su-password">Password</label>
          <input
            id="su-password"
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label htmlFor="su-confirm">Confirm Password</label>
          <input
            id="su-confirm"
            type="password"
            placeholder="Confirm your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <button className="btn-login" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create Account'}
        </button>

        <p className="auth-switch">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin}>Sign In</button>
        </p>
      </form>
    </div>
  );
}
