import React, { useState, useEffect } from 'react';
import { Download, Upload, Save, AlertCircle, RefreshCw, Image as ImageIcon, Database, Folder, CheckCircle, ExternalLink } from 'lucide-react';
import { useAuth, getAccessToken, setAccessToken } from '../lib/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';
import { gatherAllData } from '../lib/backup';
import { deleteAllData } from '../lib/reset';
import { uploadToDrive } from '../lib/drive';
import { runPhotoMigration, MigrationReport } from '../lib/imageService';
import { getUserSettings, initializeDriveFolders } from '../lib/settingsUtils';

export function SettingsView() {
  const { user } = useAuth();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);
  const [driveFolders, setDriveFolders] = useState<any>(null);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setAccessToken(tokenResponse.access_token);
      setStatus({ type: 'success', message: 'Google Drive connected successfully!' });
      // Optionally run repair automatically after connection
      if (user && !user.isAnonymous) {
        try {
          const folders = await initializeDriveFolders(user.uid, true);
          setDriveFolders(folders);
        } catch (e) {
          console.error("Failed to initialize folders after login", e);
        }
      }
    },
    onError: (errorResponse) => {
      setStatus({ type: 'error', message: 'Failed to connect to Google Drive' });
      console.error(errorResponse);
    },
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    prompt: 'consent'
  });

  useEffect(() => {
    if (user && !user.isAnonymous) {
      getUserSettings(user.uid).then(settings => {
        if (settings?.driveFolders) {
          setDriveFolders(settings.driveFolders);
        }
      });
    }
  }, [user]);

  const handleRepairDriveFolders = async () => {
    if (!user || user.isAnonymous) {
      setStatus({ type: 'error', message: 'You must be signed in to repair folders.' });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setStatus({ type: 'error', message: 'Google Drive access token is missing. Please sign in again.' });
      return;
    }
    
    setIsBackingUp(true);
    setStatus({ type: 'info', message: 'Scanning and repairing Google Drive folders...' });
    try {
      const folders = await initializeDriveFolders(user.uid, true);
      setDriveFolders(folders);
      setStatus({ type: 'success', message: 'Drive folders checked and repaired successfully.' });
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: `Drive folder repair failed: ${e.message}` });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRunPhotoMigration = async () => {
    if (!user || user.isAnonymous) {
      setStatus({ type: 'error', message: 'You must be signed in to repair photo storage.' });
      return;
    }
    setIsBackingUp(true);
    setStatus({ type: 'info', message: 'Scanning all Firestore records and backing up photos to Firebase Storage & Google Drive...' });
    try {
      const report = await runPhotoMigration(user.uid);
      setMigrationReport(report);
      setStatus({ 
        type: 'success', 
        message: `Photo migration complete! Scanned ${report.totalScanned} photos. Recovered/Migrated: ${report.recovered}, Unrecoverable (old blob URLs): ${report.unrecoverable}.` 
      });
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: `Photo migration failed: ${e.message}` });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleBackupNow = async () => {
    if (!user || user.isAnonymous) {
      setStatus({ type: 'error', message: 'You must be signed in to backup.' });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setStatus({ type: 'error', message: 'Google Drive access token is missing. Please sign in again.' });
      return;
    }

    setIsBackingUp(true);
    setStatus({ type: 'info', message: 'Gathering data...' });
    try {
      const data = await gatherAllData(user.uid);
      const json = JSON.stringify(data, null, 2);
      const file = new File([json], `planner_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, { type: 'application/json' });
      
      setStatus({ type: 'info', message: 'Uploading backup to Google Drive...' });
      await uploadToDrive(file, 'Hunter Planner Backups');
      setStatus({ type: 'success', message: 'Backup completed successfully and saved to Google Drive.' });
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: `Backup failed: ${e.message}` });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleExportEverything = async () => {
    if (!user || user.isAnonymous) {
      setStatus({ type: 'error', message: 'You must be signed in to export data.' });
      return;
    }
    setIsBackingUp(true);
    setStatus({ type: 'info', message: 'Gathering data for export...' });
    try {
      const data = await gatherAllData(user.uid);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planner_export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'Export completed.' });
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', message: `Export failed: ${e.message}` });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = () => {
    setStatus({ type: 'info', message: 'To restore a backup, please download the JSON file from your Google Drive (in "Hunter Planner Backups" folder) and contact support or manually import it if you have the tools.' });
  };
  
  const handleFactoryReset = async () => {
    if (!window.confirm("WARNING: This will permanently delete ALL your data, logs, habits, and preferences across the entire app. This action CANNOT be undone. Are you absolutely sure?")) {
      return;
    }
    
    if (user && !user.isAnonymous) {
      setIsBackingUp(true);
      setStatus({ type: 'info', message: 'Deleting all cloud data...' });
      try {
        await deleteAllData(user.uid);
      } catch (e: any) {
        setStatus({ type: 'error', message: 'Failed to delete cloud data.' });
        setIsBackingUp(false);
        return;
      }
    }
    
    // Clear local storage
    localStorage.clear();
    
    setStatus({ type: 'success', message: 'All data has been deleted. Reloading...' });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };
  

  return (
    <div className="flex-1 flex flex-col relative w-full h-[100dvh] overflow-hidden bg-surface">
      <div className="flex flex-col h-full overflow-y-auto px-4 md:px-8 py-8 md:py-12">
        <div className="max-w-3xl mx-auto w-full">
          <h1 className="text-[32px] md:text-[40px] font-bold font-headline-md text-on-surface mb-8 tracking-tight">Settings</h1>

          {status && (
            <div className={`p-4 mb-6 rounded-xl flex items-start gap-3 ${
              status.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
              status.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {status.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /> :
               status.type === 'info' ? <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" /> :
               <Save className="w-5 h-5 shrink-0 mt-0.5" />}
              <span className="font-medium text-sm leading-relaxed">{status.message}</span>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 shadow-sm mb-6">
            <h2 className="text-[20px] font-bold text-on-surface mb-2 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" /> Permanent Photo Storage & Google Drive Backup
            </h2>
            <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
              Verify and repair all photo references across Prints, Boards, Wiki, Keychains, and Printing catalogs. 
              Images are permanently hosted in Firebase Storage and automatically backed up to Google Drive under <span className="font-semibold text-on-surface">Huntrr Planner Photo Backup</span>.
            </p>

            <button 
              onClick={handleRunPhotoMigration}
              disabled={isBackingUp}
              className="flex items-center justify-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 px-5 py-3 rounded-full text-sm font-bold transition-colors disabled:opacity-50"
            >
              <Database className="w-4 h-4" /> Run Storage Audit & Backup Scan
            </button>

            {migrationReport && (
              <div className="mt-4 p-4 bg-surface-variant/40 rounded-xl text-xs font-mono text-on-surface-variant space-y-1">
                <div className="font-bold text-sm text-on-surface mb-2">Scan & Repair Summary</div>
                <div>Total Scanned: {migrationReport.totalScanned}</div>
                <div>Recovered / Verified: {migrationReport.recovered}</div>
                <div>Unrecoverable (Expired Blobs): {migrationReport.unrecoverable}</div>
                {migrationReport.details.length > 0 && (
                  <div className="mt-3 max-h-36 overflow-y-auto pt-2 border-t border-outline-variant/30 space-y-1">
                    {migrationReport.details.map((line, idx) => (
                      <div key={idx} className="truncate">{line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 shadow-sm mb-6">
            <h2 className="text-[20px] font-bold text-on-surface mb-2 flex items-center gap-2">
              <Folder className="w-5 h-5 text-primary" /> Google Drive Connection
            </h2>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Manage your connection to Google Drive for storing Prints and Boards.
            </p>

            <div className="space-y-4 mb-6 text-sm text-on-surface">
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/30">
                <span className="font-medium">Connected Google account</span>
                <span className="text-on-surface-variant">{user?.email || 'Not signed in'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/30">
                <span className="font-medium">Main folder ("huntrr daily images")</span>
                <span className="flex items-center gap-2">
                  {driveFolders?.mainFolderId ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
                  {driveFolders?.mainFolderId ? 'Connected' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/30">
                <span className="font-medium">Prints folder status</span>
                <span className="flex items-center gap-2">
                  {driveFolders?.printsFolderId ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
                  {driveFolders?.printsFolderId ? 'Connected' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/30">
                <span className="font-medium">Boards folder status</span>
                <span className="flex items-center gap-2">
                  {driveFolders?.boardsFolderId ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
                  {driveFolders?.boardsFolderId ? 'Connected' : 'Missing'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => login()}
                className="flex items-center justify-center gap-2 bg-surface-variant text-on-surface px-5 py-3 rounded-full text-sm font-bold shadow-sm border border-outline-variant/30 hover:bg-surface-variant/80 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Connect Google Drive
              </button>
              
              {driveFolders?.mainFolderId && (
                <a 
                  href={`https://drive.google.com/drive/folders/${driveFolders.mainFolderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-5 py-3 rounded-full text-sm font-bold shadow-sm hover:bg-secondary-container/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Open in Drive
                </a>
              )}

              <button 
                onClick={handleRepairDriveFolders}
                disabled={isBackingUp}
                className="flex items-center justify-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 px-5 py-3 rounded-full text-sm font-bold transition-colors disabled:opacity-50"
              >
                <Folder className="w-4 h-4" /> Repair folder connections
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 shadow-sm mb-6">
            <h2 className="text-[20px] font-bold text-on-surface mb-2 flex items-center gap-2">
              <Save className="w-5 h-5 text-primary" /> Data Backup & Recovery
            </h2>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Store a permanent copy of your logs, habits, and preferences directly to your Google Drive. 
              The backup will be placed in a folder named <span className="font-semibold text-on-surface">Hunter Planner Backups</span>.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={handleBackupNow}
                disabled={isBackingUp}
                className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-3 rounded-full text-sm font-bold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" /> Back Up Now
              </button>
              <button 
                onClick={handleRestoreBackup}
                disabled={isBackingUp}
                className="flex items-center justify-center gap-2 bg-surface-variant text-on-surface px-5 py-3 rounded-full text-sm font-bold shadow-sm border border-outline-variant/30 hover:bg-surface-variant/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" /> Restore Backup
              </button>
              <button 
                onClick={handleExportEverything}
                disabled={isBackingUp}
                className="flex items-center justify-center gap-2 bg-secondary-container text-on-secondary-container px-5 py-3 rounded-full text-sm font-bold shadow-sm hover:bg-secondary-container/90 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> Export Everything
              </button>
            </div>
          </div>
          
          <div className="bg-red-50 p-6 rounded-2xl border border-red-200 shadow-sm mb-6">
            <h2 className="text-[20px] font-bold text-red-700 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Danger Zone
            </h2>
            <p className="text-sm text-red-700/80 mb-6 leading-relaxed">
              Permanently delete all your personal data, preferences, boards, and habits from this application. This will completely reset your account.
            </p>
            <button 
              onClick={handleFactoryReset}
              disabled={isBackingUp}
              className="flex items-center justify-center gap-2 bg-red-600 text-white px-5 py-3 rounded-full text-sm font-bold shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              Factory Reset & Delete All Data
            </button>
          </div>
  
        </div>
      </div>
    </div>
  );
}
