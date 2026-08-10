import { getAccessToken } from './AuthContext';
import firebaseConfig from '../../firebase-applet-config.json';

// Keep track of script load status
let isPickerLoaded = false;

export async function loadGooglePicker(): Promise<void> {
  if (isPickerLoaded) return;
  return new Promise((resolve, reject) => {
    window.gapi.load('picker', {
      callback: () => {
        isPickerLoaded = true;
        resolve();
      },
      onerror: reject
    });
  });
}

export interface PickerResult {
  id: string;
  name: string;
  url: string;
  mimeType: string;
}

export async function showGooglePicker(
  viewId: 'docs' | 'folders' | 'images' | 'all' = 'images',
  folderId?: string,
  multiSelect: boolean = false
): Promise<PickerResult[]> {
  await loadGooglePicker();
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  return new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView(window.google.picker.ViewId[viewId.toUpperCase() === 'IMAGES' ? 'DOCS_IMAGES' : viewId.toUpperCase()]);
    
    if (folderId) {
      view.setParent(folderId);
    }
    
    // Create builder
    const builder = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setCallback((data: any) => {
        if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
          const docs = data[window.google.picker.Response.DOCUMENTS];
          const results = docs.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            url: doc.url,
            mimeType: doc.mimeType
          }));
          resolve(results);
        } else if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.CANCEL) {
          resolve([]);
        }
      });
      
    if (multiSelect) {
      builder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    }

    if (firebaseConfig.apiKey) {
      builder.setDeveloperKey(firebaseConfig.apiKey);
    }
    
    const picker = builder.build();
    picker.setVisible(true);
    
    // Add z-index fix for picker
    setTimeout(() => {
      const pickerElements = document.querySelectorAll('.picker-dialog-bg, .picker-dialog');
      pickerElements.forEach((el: any) => {
        el.style.zIndex = '99999';
      });
    }, 100);
  });
}

// Add types for window.google
declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}
