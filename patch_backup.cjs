const fs = require('fs');
let code = fs.readFileSync('src/lib/backup.ts', 'utf8');
code = code.replace(/const collections = \[[\s\S]*?\];/, `const collections = [
    'preferences',
    'dailyLogs',
    'boards',
    'photos',
    'notes',
    'goals',
    'keychains',
    'minifurniture',
    'reminders',
    'blog',
    'jobs'
  ];`);
fs.writeFileSync('src/lib/backup.ts', code);
console.log('patched backup.ts');
