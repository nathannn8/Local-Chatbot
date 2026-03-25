import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ff6b7a', background: '#12121a', height: '100%', fontFamily: 'Inter, sans-serif' }}>
          <h2>Something went wrong in the chat interface.</h2>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px', fontSize: '13px' }}>
            {this.state.error && this.state.error.toString()}
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 16px', background: '#6c5ce7', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
