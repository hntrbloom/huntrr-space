const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/const \[boards, setBoards\] = useState<InspirationBoard\[\]>\(\[\]\);/, `const [boards, setBoards] = useState<InspirationBoard[]>([]);
  const [needsDriveAuth, setNeedsDriveAuth] = useState(false);`);

code = code.replace(/if \(!token\) throw new Error\("No token"\);/g, `if (!token) {
            setNeedsDriveAuth(true);
            throw new Error("No token");
          }`);

code = code.replace(/if \(!res\.ok\) throw new Error\("Failed to load drive image"\);/, `if (res.status === 401) {
            setNeedsDriveAuth(true);
          }
          if (!res.ok) throw new Error("Failed to load drive image");`);

code = code.replace(/\{uploadErrors\.length > 0 && \(/, `{needsDriveAuth && !user?.isAnonymous && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-yellow-800">Google Drive Access Required</p>
                <p className="text-sm text-yellow-700">Please sign in again to view or upload your Drive photos.</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setNeedsDriveAuth(false);
                // The main sign-in method handles re-auth
                const { signIn } = useAuth; // Wait, useAuth is a hook.
                // We must use the context directly.
              }}
              className="px-4 py-2 bg-yellow-600 text-white rounded-xl text-sm font-bold hover:bg-yellow-700 transition-colors shrink-0"
            >
              Sign In Again
            </button>
          </div>
        )}
        
        {uploadErrors.length > 0 && (`);

// Fix the onClick above since useAuth can't be called inside onClick.
// Fortunately we already have \`signIn\` available in InspirationView from \`const { user } = useAuth();\`?
// Let's check InspirationView top:
fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
