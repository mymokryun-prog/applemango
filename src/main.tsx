import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global Fetch Interceptor to inject JWT authentication tokens
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input && 'url' in input ? input.url : ''));
  const isApiCall = url.startsWith('/api/') || url.startsWith('api/') || url.includes('/api/');

  if (isApiCall) {
    const token = localStorage.getItem('aemang_token');
    const activeProfileId = (() => {
      const phone = localStorage.getItem('aemang_phone');
      if (phone) return 'user-' + phone.replace(/\D/g, '');
      return null;
    })();

    const headers = new Headers(init?.headers);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (activeProfileId && !headers.has('X-User-Id')) {
      headers.set('X-User-Id', activeProfileId);
    }
    
    // Do not override Content-Type if it is already set or if it's FormData
    if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    return originalFetch(input, {
      ...init,
      headers
    });
  }

  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 개발 중에는 SW가 빈 index.html을 캐시해 화면이 안 뜨는 경우가 있어 프로덕션만 등록
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered:', registration.scope);
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}

// 이전에 등록된 SW가 dev에서 남아 있으면 제거
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

