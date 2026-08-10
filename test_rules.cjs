const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(/export async function safeGetDoc\(ref: DocumentReference\) \{/g, `export async function safeGetDoc(ref: DocumentReference) {
  console.log("Reading doc:", ref.path);
`);

code = code.replace(/export async function safeGetDocs\(query: Query\) \{/g, `export async function safeGetDocs(query: Query) {
  console.log("Reading docs query");
`);

fs.writeFileSync('src/lib/firebase.ts', code);
