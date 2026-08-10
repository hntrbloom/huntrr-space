const fs = require('fs');
let code = fs.readFileSync('src/components/DailyLogView.tsx', 'utf8');

code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, `const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');`);

code = code.replace(/} catch \(err\) {[\s\S]*?console\.error\('Error fetching daily log:', err\);/, `} catch (err: any) {
        console.error('Error fetching daily log:', err);
        setLoadError(err.message || 'Failed to load data. Please refresh.');`);

code = code.replace(/if \(loading\) \{[\s\S]*?return \([\s\S]*?<\/[^>]+>[\s\S]*?\);[\s\S]*?\}/, `if (loading) {
    return (
      <div className="flex-1 flex flex-col relative w-full h-[100dvh] bg-surface flex items-center justify-center">
         <div className="text-on-surface-variant animate-pulse font-medium">Loading your planner...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col relative w-full h-[100dvh] bg-surface flex items-center justify-center p-8">
         <div className="text-red-500 font-bold mb-4">{loadError}</div>
         <button onClick={() => window.location.reload()} className="px-6 py-2 bg-primary text-white rounded-full">Refresh Page</button>
      </div>
    );
  }`);

fs.writeFileSync('src/components/DailyLogView.tsx', code);
console.log('patched catch');
