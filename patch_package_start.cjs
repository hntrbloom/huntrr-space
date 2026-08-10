const fs = require('fs');
let code = fs.readFileSync('package.json', 'utf8');
code = code.replace(/"build": "vite build && esbuild server.ts[^"]+",/, `"build": "vite build",`);
code = code.replace(/"start": "node dist\/server.cjs",/, `"start": "node server.ts",`);
fs.writeFileSync('package.json', code);
console.log('patched package.json');
