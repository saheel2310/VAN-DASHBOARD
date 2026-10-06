import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 22 }}>Something went wrong</h2>
          <p style={{ color: '#687287', margin: '0 0 20px', fontSize: 14 }}>{error.message}</p>
          <button
            className="secondary-button"
            onClick={() => this.setState({ error: null })}
            type="button"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
