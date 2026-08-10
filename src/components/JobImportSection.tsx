import React, { useState } from 'react';
import { JobApplication } from './JobApplicationsView';

export function JobImportSection({ onImportSuccess }: { onImportSuccess: (job: Partial<JobApplication>) => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL.');
      return;
    }
    
    // Basic validation
    if (!url || (!url.includes('linkedin.com/jobs/view/') && !url.includes('indeed.com/viewjob') && !url.includes('linkedin.com/jobs/'))) {
      setError('Please enter a valid LinkedIn or Indeed job link.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/extract-job-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        // If it fails completely, we still open the form with the URL
        onImportSuccess({ originalUrl: url, link: url });
        setUrl('');
        return;
      }

      const data = await response.json();
      onImportSuccess({ ...data, originalUrl: url, link: url });
      setUrl('');
      
    } catch (err) {
      console.error(err);
      onImportSuccess({ originalUrl: url, link: url });
      setUrl('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-md mb-8">
      <h4 className="text-[16px] md:text-[18px] font-semibold text-on-surface mb-4">Import Job From Link</h4>
      
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
        <div className="flex-1 w-full">
          <label className="block text-[14px] font-medium text-on-surface-variant mb-1.5">LinkedIn or Indeed job link</label>
          <input 
            type="url" 
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            disabled={loading}
            className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-2.5 text-[16px] text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={handleImport}
            disabled={loading || !url}
            className="px-6 py-2.5 rounded-full text-[14px] font-medium bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm flex-1 md:flex-none flex items-center justify-center min-w-[120px]"
          >
            {loading ? 'Importing...' : 'Import Job'}
          </button>
          <button 
            onClick={() => { setUrl(''); setError(null); }}
            disabled={loading}
            className="px-4 py-2.5 rounded-full text-[14px] font-medium text-on-surface-variant border border-outline-variant/50 hover:bg-surface-variant transition-colors disabled:opacity-50"
          >
            Clear
          </button>
          {url && !error && (
             <a href={url} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-full text-[14px] font-medium text-primary hover:bg-primary-container transition-colors whitespace-nowrap">
               Open Original Listing
             </a>
          )}
        </div>
      </div>
      
      {error && (
        <div className="mt-4 p-3 bg-error-container text-error rounded-xl text-[14px]">
          {error}
        </div>
      )}
    </div>
  );
}
