import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Sean from './Sean';

const root = ReactDOM.createRoot(document.getElementById('root'));

const path = window.location.pathname;

root.render(
  <React.StrictMode>
    {path === '/sean' ? <Sean /> : <App />}
  </React.StrictMode>
);
