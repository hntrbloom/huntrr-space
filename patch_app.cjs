const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
if (!code.includes('SettingsView')) {
  code = code.replace(/import \{ FocusTimer \} from '\.\/components\/FocusTimer';/, `import { FocusTimer } from './components/FocusTimer';\nimport { SettingsView } from './components/SettingsView';`);
  code = code.replace(/case 'jobs':\n        return <JobApplicationsView \/>;/, `case 'jobs':\n        return <JobApplicationsView \/>;\n      case 'settings':\n        return <SettingsView \/>;`);
  fs.writeFileSync('src/App.tsx', code);
  console.log('patched App.tsx');
}
