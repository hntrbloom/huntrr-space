const fs = require('fs');
let code = fs.readFileSync('src/components/Navigation.tsx', 'utf8');
if (!code.includes("id: 'settings'")) {
  code = code.replace(/import \{ CheckCircle2, [^}]+ \} from 'lucide-react';/, match => {
    return match.replace("} from 'lucide-react';", ", Settings } from 'lucide-react';");
  });
  
  code = code.replace(/\{ id: 'jobs', label: 'Job Applications', Icon: Briefcase \},/, `{ id: 'jobs', label: 'Job Applications', Icon: Briefcase },\n    { id: 'settings', label: 'Settings', Icon: Settings },`);
  
  code = code.replace(/\{ id: 'jobs', label: 'Jobs', Icon: Briefcase \},/, `{ id: 'jobs', label: 'Jobs', Icon: Briefcase },\n    { id: 'settings', label: 'Settings', Icon: Settings },`);
  
  fs.writeFileSync('src/components/Navigation.tsx', code);
  console.log('patched Navigation.tsx');
}
