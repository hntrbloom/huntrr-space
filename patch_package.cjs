const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.build = "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs";
pkg.scripts.start = "node dist/server.cjs";
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('patched package.json');
