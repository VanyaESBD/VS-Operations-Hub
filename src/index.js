import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Sean from './Sean';
import AuthGate from './AuthGate';

const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname;

// AuthGate is a no-op while REACT_APP_AUTH_ENABLED is not "true" (see src/lib/config.js).
root.render(
  <React.StrictMode>
    <AuthGate>
      {path === '/sean' ? <Sean /> : <App />}
    </AuthGate>
  </React.StrictMode>
);
