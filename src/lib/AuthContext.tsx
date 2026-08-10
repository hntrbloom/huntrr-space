import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { LogIn, AlertCircle, UserCircle2 } from 'lucide-react';

let cachedAccessToken: string | null = null;

export const getAccessToken = () => cachedAccessToken;
export const setAccessToken = (token: string | null) => { cachedAccessToken = token; };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    // Force prompt to ensure the user is asked for their account
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
    } catch (error: any) {
      console.error('Error signing in', error);
      if (error.code === 'auth/popup-blocked' || error.message?.toLowerCase().includes('popup')) {
        setError('Sign in popup was blocked. Please open the app in a new tab (using the button in the top right corner) to sign in.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign in popup was closed. Please try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setError(`This domain (${window.location.hostname}) is not authorized. Please go to your Firebase Console > Authentication > Settings > Authorized domains, and add this domain.`);
      } else {
        setError(error.message || 'An error occurred during sign in. Please try opening the app in a new tab.');
      }
    }
  };

  const signInAsGuest = async () => {
    setError(null);
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error('Error signing in anonymously', error);
      if (error.code === 'auth/operation-not-allowed') {
        setError('Guest sign-in is not enabled. Please enable Anonymous Auth in your Firebase Console.');
      } else {
        setError(error.message || 'An error occurred during guest sign in.');
      }
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
      cachedAccessToken = null;
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/30 shadow-md text-center max-w-md w-full mx-4">
          <h2 className="text-[28px] font-headline-md text-on-surface mb-2">Welcome</h2>
          <p className="text-[16px] font-body-md text-on-surface-variant mb-8">Sign in to save your planner data and preferences.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl text-[14px] font-body-md flex items-start text-left gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <button 
              type="button"
              onClick={signIn}
              className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-label-md font-semibold hover:bg-primary/90 transition-colors"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>
            
            <div className="relative py-2 flex items-center justify-center mt-2 mb-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant/30"></div>
              </div>
              <div className="relative bg-surface-container-lowest px-4 text-[12px] font-label-sm text-on-surface-variant uppercase tracking-wider">
                Or
              </div>
            </div>

            <button 
              type="button"
              onClick={signInAsGuest}
              className="w-full flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-6 py-3 rounded-full font-label-md font-semibold hover:bg-secondary-container/90 transition-colors"
            >
              <UserCircle2 className="w-5 h-5" />
              Preview as Guest
            </button>
            
            <p className="text-[12px] text-on-surface-variant text-center mt-4">
              If sign-in is blocked in this preview, please click the "Open in new tab" icon at the top right of this panel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInAsGuest, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
