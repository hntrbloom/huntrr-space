const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/if \(res\.status === 401\) \{[\s\S]*?const blob = await res\.blob\(\);\s*newResolved\[photo\.url\] = URL\.createObjectURL\(blob\);\s*\} catch \(err\) \{/m, `if (res.status === 401) {
            setNeedsDriveAuth(true);
            newResolved[photo.url] = 'auth_error';
          } else if (res.status === 404) {
            newResolved[photo.url] = 'error'; // Not found, unrecoverable
          } else if (!res.ok) {
            newResolved[photo.url] = 'auth_error'; // Assume temporary failure or permission error we shouldn't delete for
          } else {
            const blob = await res.blob();
            newResolved[photo.url] = URL.createObjectURL(blob);
          }
        } catch (err) {`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
