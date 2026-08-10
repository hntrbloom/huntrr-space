import React, { createContext, useContext, useState, ReactNode } from 'react';
import { SyncStatus } from '../components/SyncStatus';

type SyncStatusType = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface SyncContextType {
  syncStatus: SyncStatusType;
  setSyncStatus: (status: SyncStatusType) => void;
  withSync: <T>(promise: Promise<T>) => Promise<T>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatusType>('idle');

  const withSync = async <T,>(promise: Promise<T>): Promise<T> => {
    setSyncStatus('saving');
    try {
      const result = await promise;
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
      return result;
    } catch (error) {
      console.error(error);
      setSyncStatus('error');
      throw error;
    }
  };

  return (
    <SyncContext.Provider value={{ syncStatus, setSyncStatus, withSync }}>
      {children}
      <SyncStatus status={syncStatus} />
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
