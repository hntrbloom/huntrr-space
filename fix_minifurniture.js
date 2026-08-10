const fs = require('fs');
let content = fs.readFileSync('src/components/MiniFurnitureView.tsx', 'utf8');

// Ensure we wrap executeSaveAndUploads in a try/finally
content = content.replace(/    } catch \(err: any\) {\n      console.error\("Save print failed:", err\);\n      setSaveError\(err\?\.message \|\| 'Failed to save print design\. Please retry\.'\);\n      setIsSaving\(false\);\n      setUploadStageText\(''\);\n    }\n  };\n/g, 
`    } catch (err: any) {
      console.error("Save print failed:", err);
      setSaveError(err?.message || 'Failed to save print design. Please retry.');
      setIsSaving(false);
      setUploadStageText('');
    } finally {
      setIsSaving(false); // Failsafe
    }
  };
`);

fs.writeFileSync('src/components/MiniFurnitureView.tsx', content);
console.log("Fixed finally block");
