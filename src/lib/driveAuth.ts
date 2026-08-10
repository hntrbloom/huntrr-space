import { setAccessToken } from './AuthContext';
import firebaseConfig from '../../firebase-applet-config.json';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT_ID = 'google-gis-script';

function getDriveClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || (firebaseConfig as any).oAuthClientId || '').trim();
}

function ensureGisLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve();
    };
    const timeoutId = window.setTimeout(
      () => finish(new Error('Google authorization library timed out. Check your connection and try again.')),
      15000
    );

    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        if ((window as any).google?.accounts?.oauth2) finish();
        else finish(new Error('Google authorization library did not initialize.'));
      }, { once: true });
      existing.addEventListener('error', () => finish(new Error('Google authorization library failed to load.')), { once: true });
      window.setTimeout(() => {
        if ((window as any).google?.accounts?.oauth2) finish();
      }, 0);
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if ((window as any).google?.accounts?.oauth2) finish();
      else finish(new Error('Google authorization library did not initialize.'));
    };
    script.onerror = () => finish(new Error('Google authorization library failed to load.'));
    document.head.appendChild(script);
  });
}

/** Obtains a fresh Google Drive access token with Google Identity Services. */
export function requestFreshDriveToken(promptUser: boolean = false): Promise<string | null> {
  return new Promise(async (resolve) => {
    setAccessToken(null);

    const clientId = getDriveClientId();
    if (!clientId) {
      console.warn('Google OAuth web client ID is missing.');
      resolve(null);
      return;
    }

    try {
      await ensureGisLoaded();
    } catch (error) {
      console.warn('[GIS OAuth] Unable to load Google authorization:', error);
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(token);
    };
    const timeoutId = window.setTimeout(() => {
      console.warn('[GIS OAuth] Token request timed out.');
      finish(null);
    }, 20000);

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response: any) => {
          if (response?.error || !response?.access_token) {
            console.warn('[GIS OAuth] Token request failed or denied:', response?.error || 'No token returned');
            finish(null);
            return;
          }
          setAccessToken(response.access_token);
          finish(response.access_token);
        },
        error_callback: (error: any) => {
          console.warn('[GIS OAuth] Popup/token error:', error?.type || error);
          finish(null);
        }
      });

      client.requestAccessToken({ prompt: promptUser ? 'consent' : '' });
    } catch (err) {
      console.warn('[GIS OAuth] Exception initializing token client:', err);
      finish(null);
    }
  });
}
