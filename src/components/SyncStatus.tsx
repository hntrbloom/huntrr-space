import React from 'react';
import { Cloud, CloudOff, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export function SyncStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' | 'offline' }) {
  if (status === 'idle') return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg bg-surface-container-highest text-on-surface text-sm font-medium animate-in slide-in-from-bottom-4 fade-in duration-300">
      {status === 'saving' && (
        <>
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          <span>Saving changes...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span>All changes saved</span>
        </>
      )}
      {status === 'offline' && (
        <>
          <CloudOff className="w-4 h-4 text-outline" />
          <span>Offline - Changes saved locally</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-error" />
          <span className="text-error">Error saving changes</span>
        </>
      )}
    </div>
  );
}
