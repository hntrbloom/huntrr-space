const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

if (!code.includes('deleteAllData')) {
  code = code.replace(/import \{ gatherAllData \} from '\.\.\/lib\/backup';/, `import { gatherAllData } from '../lib/backup';\nimport { deleteAllData } from '../lib/reset';`);
  
  const resetHandler = `
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
  `;
  
  code = code.replace(/const handleRestoreBackup = \(\) => \{[\s\S]*?\};/, `const handleRestoreBackup = () => {
    setStatus({ type: 'info', message: 'To restore a backup, please download the JSON file from your Google Drive (in "Hunter Planner Backups" folder) and contact support or manually import it if you have the tools.' });
  };
  ${resetHandler}`);
  
  const resetButtonHtml = `
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
  `;
  
  code = code.replace(/<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);/g, `</div>
          ${resetButtonHtml}
        </div>
      </div>
    </div>
  );`);
  
  fs.writeFileSync('src/components/SettingsView.tsx', code);
  console.log('patched settings reset');
} else {
  console.log('already patched');
}
