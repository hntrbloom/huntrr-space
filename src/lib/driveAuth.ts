import { setAccessToken } from './AuthContext';

/**
 * Obtains a fresh Google Drive OAuth access token via google.accounts.oauth2.initTokenClient.
 * @param promptUser If true, shows account selection / consent prompt (user interaction required).
 *                   If false, attempts silent token request ('prompt: none').
 */
export function requestFreshDriveToken(promptUser: boolean = false): Promise<string | null> {
  return new Promise((resolve) => {
    // Clear expired token before requesting fresh token
    setAccessToken(null);

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID is missing for GIS token request.');
      resolve(null);
      return;
    }

    const loadGisScript = (cb: () => void) => {
      if ((window as any).google?.accounts?.oauth2) {
        cb();
        return;
      }
      const existing = document.getElementById('google-gis-script');
      if (existing) {
        existing.addEventListener('load', cb);
        return;
      }
      const script = document.createElement('script');
      script.id = 'google-gis-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => cb();
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    };

    loadGisScript(() => {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response: any) => {
            if (response.error || !response.access_token) {
              console.warn('[GIS OAuth] Token request failed or denied:', response.error || 'No token returned');
              resolve(null);
            } else {
              setAccessToken(response.access_token);
              resolve(response.access_token);
            }
          },
        });

        client.requestAccessToken({ prompt: promptUser ? 'select_account' : 'none' });
      } catch (err) {
        console.warn('[GIS OAuth] Exception initializing token client:', err);
        resolve(null);
      }
    });
  });
}
