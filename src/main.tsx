import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist-mono/latin-400.css';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se ha encontrado el contenedor de la aplicación.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
