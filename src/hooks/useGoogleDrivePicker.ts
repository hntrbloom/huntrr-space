import { useState, useCallback, useEffect, useRef } from 'react';
import { getAccessToken } from '../lib/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

export interface DriveImage {
  provider: 'google-drive';
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  category?: string;
  createdTime?: number;
  driveFolderId?: string;
  // Ephemeral fields for UI display before save
  url?: string; 
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || '';

// Global cache for drive tokens
let globalDriveToken = '';

export function getDriveToken() {
  return globalDriveToken || getAccessToken();
}

export function useGoogleDrivePicker() {
  const [isPickerLoaded, setIsPickerLoaded] = useState(false);
  const pendingPickCallback = useRef<((images: DriveImage[]) => void) | null>(null);
  const pendingMultiSelect = useRef<boolean>(false);
  const pendingFolderId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (window.gapi) {
      window.gapi.load('picker', () => {
        setIsPickerLoaded(true);
      });
    }
  }, []);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive.file',
    onSuccess: (tokenResponse) => {
      globalDriveToken = tokenResponse.access_token;
      if (pendingPickCallback.current) {
        createPicker(tokenResponse.access_token, pendingPickCallback.current, pendingMultiSelect.current, pendingFolderId.current);
        pendingPickCallback.current = null;
      }
    },
  });

  const createPicker = (token: string, onPick: (images: DriveImage[]) => void, multiSelect = false, folderId?: string) => {
    if (!window.google || !window.google.picker) {
      console.error('Google Picker API not loaded');
      return;
    }

    const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setMimeTypes('image/jpeg,image/png,image/webp,image/heic,image/heif')
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
      
    if (folderId) {
      view.setParent(folderId);
    }

    const pickerBuilder = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setCallback((data: any) => {
        if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
          const docs = data[window.google.picker.Response.DOCUMENTS];
          const selectedImages: DriveImage[] = docs.map((doc: any) => ({
            provider: 'google-drive',
            fileId: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.sizeBytes || 0,
            createdTime: Date.now(),
            driveFolderId: doc.parentId || '',
            url: doc.url, // Only for preview if needed, not saved
          }));
          onPick(selectedImages);
        }
      });

    if (GOOGLE_API_KEY) {
      pickerBuilder.setDeveloperKey(GOOGLE_API_KEY);
    }
    
    if (GOOGLE_APP_ID) {
      pickerBuilder.setAppId(GOOGLE_APP_ID);
    }

    if (multiSelect) {
      pickerBuilder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    }

    const picker = pickerBuilder.build();
    picker.setVisible(true);
    
    setTimeout(() => {
      const pickerElements = document.querySelectorAll('.picker-dialog-bg, .picker-dialog');
      pickerElements.forEach((el: any) => {
        el.style.zIndex = '99999';
      });
    }, 100);
  };

  const showPicker = useCallback(
    (onPick: (images: DriveImage[]) => void, multiSelect = false, folderId?: string) => {
      const currentToken = getDriveToken();
      if (!currentToken) {
        pendingPickCallback.current = onPick;
        pendingMultiSelect.current = multiSelect;
        pendingFolderId.current = folderId;
        login();
      } else {
        createPicker(currentToken, onPick, multiSelect, folderId);
      }
    },
    [login]
  );

  return { showPicker, isPickerLoaded, login };
}

