const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

const cleanupCodeRegex = /\/\/ Auto-cleanup bad photos[\s\S]*?\}, \[photos, resolvedUrls, user\]\);/;
code = code.replace(cleanupCodeRegex, '');
fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched remove cleanup');
