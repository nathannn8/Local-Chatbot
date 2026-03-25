import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import SignUp from './components/SignUp';
import ChatLayout from './components/ChatLayout';
import './index.css';

import ErrorBoundary from './components/ErrorBoundary';

function AppRouter() {
  const { user } = useAuth();
  const [page, setPage] = useState('login');

  if (user) return <ChatLayout />;

  return page === 'signup'
    ? <SignUp onSwitchToLogin={() => setPage('login')} />
    : <Login onSwitchToSignUp={() => setPage('signup')} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}
