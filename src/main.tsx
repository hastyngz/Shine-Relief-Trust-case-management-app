import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/Error/ErrorBoundary.tsx';
import { registerAppShellServiceWorker } from './pwa/registerServiceWorker.ts';
import './index.css';
import './styles/effects.css';
import './styles/sunrise.css';

// Cache the app shell so the app opens without signal. Production builds only.
registerAppShellServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary label="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
