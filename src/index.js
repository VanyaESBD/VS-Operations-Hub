import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Sean from './Sean';
import Team from './Team';

const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname;

root.render(
  <React.StrictMode>
    {path === '/sean' ? <Sean /> : path === '/team' ? <Team /> : <App />}
  </React.StrictMode>
);
