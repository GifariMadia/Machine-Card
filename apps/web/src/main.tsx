import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { ErrorBoundary } from './App';

const rootElement = document.getElementById('root');
if (rootElement) {
  // Clear any pre-rendered fallback markup immediately before mounting React
  rootElement.innerHTML = '';
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
