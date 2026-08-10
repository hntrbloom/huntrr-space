const fs = require('fs');
let code = fs.readFileSync('package.json', 'utf8');
code = code.replace(/"build": "vite build",/, `"build": "vite build",`);
code = code.replace(/"start": "node server\.ts",/, `"start": "node --experimental-strip-types server.ts",`);
fs.writeFileSync('package.json', code);
console.log('patched');
