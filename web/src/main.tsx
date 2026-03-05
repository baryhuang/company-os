import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InsforgeProvider } from '@insforge/react';
import { insforge } from './insforge';
import './theme.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
    <InsforgeProvider client={insforge as any}>
      <App />
    </InsforgeProvider>
  </StrictMode>,
);
