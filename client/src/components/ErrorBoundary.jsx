import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("NexusTerm UI Error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-screen bg-ctp-crust text-ctp-text p-6 text-center">
          <AlertTriangle size={64} className="text-ctp-red mb-6 animate-pulse" />
          <h1 className="text-2xl font-bold mb-2">Oops! The terminal interface crashed.</h1>
          <p className="text-ctp-subtext0 max-w-md mb-6">
            An unexpected error occurred in the React component tree. Your background processes and backend server are likely still running fine.
          </p>
          
          {this.state.error && (
            <div className="bg-ctp-mantle border border-ctp-surface0 p-4 rounded-lg text-left max-w-2xl w-full mb-8 overflow-x-auto">
              <code className="text-ctp-red text-sm font-mono whitespace-pre-wrap">
                {this.state.error.toString()}
              </code>
            </div>
          )}

          <button 
            onClick={this.handleReload}
            className="flex items-center gap-2 bg-ctp-blue text-ctp-crust px-6 py-3 rounded-lg font-semibold hover:bg-ctp-lavender transition-colors"
          >
            <RefreshCw size={18} />
            Reload Interface
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}
