import { Buffer } from 'buffer';
import process from 'process';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';                 // Tailwind base + design tokens
import './styles/index.css';          // App component styles
import './styles/app-overrides.css';  // Axiora Pulse visual overrides

window.global = window;
window.Buffer = Buffer;
window.process = process;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Trigger staging deployment pipeline via Pull Request


