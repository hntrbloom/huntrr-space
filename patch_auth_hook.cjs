const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');
code = code.replace(/const \{ signIn \} = useAuth;/g, `const { signIn } = useAuth();`);
fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
