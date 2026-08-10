const fs = require('fs');
let code = fs.readFileSync('src/components/HabitsView.tsx', 'utf8');

code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, `const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');`);

code = code.replace(/} catch \(err\) {[\s\S]*?console\.error\('Error fetching habits:', err\);/, `} catch (err: any) {
        console.error('Error fetching habits:', err);
        setLoadError(err.message || 'Failed to load data. Please refresh.');`);

code = code.replace(/\{!loading && \(/, `{loadError && (
  <div className="pl-14 md:pl-24 pr-4 md:pr-12 mt-8">
    <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200 shadow-sm flex flex-col items-start gap-4">
      <h3 className="font-bold text-lg">Error loading planner data</h3>
      <p className="font-medium">{loadError}</p>
      <p className="text-sm">We stopped loading to prevent overwriting your existing data. Please refresh the page.</p>
      <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors">Refresh Page</button>
    </div>
  </div>
)}
{!loading && !loadError && (`);

code = code.replace(/\} catch \(err\) \{/, `} catch (err: any) { setLoadError(err.message || 'Failed to load data.'); `);

fs.writeFileSync('src/components/HabitsView.tsx', code);
console.log('patched habits catch');
