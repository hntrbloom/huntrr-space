const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/const \{ user \} = useAuth\(\);/, `const { user, signIn } = useAuth();`);
code = code.replace(/const \{ signIn \} = useAuth;/g, `signIn().catch(console.error);`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
