import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

async function initApp() {
  // Sync Supabase config from server before loading/rendering the app
  try {
    const res = await fetch('/api/supabase-config');
    if (res.ok) {
      const config = await res.json();
      const serverUrl = (config.url || '').trim();
      const serverKey = (config.key || '').trim();

      if (serverUrl && serverKey) {
        localStorage.setItem('CUSTOM_SUPABASE_URL', serverUrl);
        localStorage.setItem('CUSTOM_SUPABASE_ANON_KEY', serverKey);
      } else {
        localStorage.removeItem('CUSTOM_SUPABASE_URL');
        localStorage.removeItem('CUSTOM_SUPABASE_ANON_KEY');
      }
    }
  } catch (e) {
    console.warn('Failed to fetch initial Supabase config from server:', e);
  }

  // Dynamically import App to ensure supabase.ts evaluates AFTER localStorage is set
  const { default: App } = await import('./App.tsx');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

initApp();
