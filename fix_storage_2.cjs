const fs = require('fs');
let content = fs.readFileSync('src/lib/storage.ts', 'utf8');

content = content.replace(
`          async () => {
            try {
              const downloadUrl = await withTimeout(
                getDownloadURL(uploadTask.snapshot.ref),
                15000,
                "Failed to retrieve download URL within 15 seconds"
              );
              clearTimeout(timeoutTimer);`,
`          async () => {
            clearTimeout(timeoutTimer);
            try {
              const downloadUrl = await withTimeout(
                getDownloadURL(uploadTask.snapshot.ref),
                15000,
                "Failed to retrieve download URL within 15 seconds"
              );`
);

fs.writeFileSync('src/lib/storage.ts', content);
console.log("Fixed storage timeout 2");
