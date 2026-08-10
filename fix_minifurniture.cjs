const fs = require('fs');
let content = fs.readFileSync('src/components/MiniFurnitureView.tsx', 'utf8');

// We want to make sure the state is updated properly in executeSaveAndUploads
// The issue might be that setState from an async function inside a for loop batches poorly?

// Actually, let's fix the state updating first:
content = content.replace(
`      if (toUpload.length > 0) {
        setUploadStageText(\`Uploading \${toUpload.length} photo(s)...\`);

        // Update status to uploading
        setPendingUploads(prev => prev.map(p => 
          toUpload.some(u => u.id === p.id) ? { ...p, status: 'uploading', error: undefined, progress: 0 } : p
        ));`,
`      if (toUpload.length > 0) {
        setUploadStageText(\`Uploading \${toUpload.length} photo(s)...\`);

        // Update status to uploading
        setPendingUploads(prev => prev.map(p => 
          toUpload.some(u => u.id === p.id) ? { ...p, status: 'uploading', error: undefined, progress: 0 } : p
        ));`
);

// We need to add the finally block
content = content.replace(
`    } catch (err: any) {
      console.error("Save print failed:", err);
      setSaveError(err?.message || 'Failed to save print design. Please retry.');
      setIsSaving(false);
      setUploadStageText('');
    }
  };`,
`    } catch (err: any) {
      console.error("Save print failed:", err);
      setSaveError(err?.message || 'Failed to save print design. Please retry.');
      setIsSaving(false);
      setUploadStageText('');
    } finally {
      setIsSaving(false);
    }
  };`
);

fs.writeFileSync('src/components/MiniFurnitureView.tsx', content);
console.log("Fixed finally block");
