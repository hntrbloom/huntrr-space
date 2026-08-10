const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(/export async function safeGetDoc[\s\S]*?export async function safeGetDocs/m, `export async function safeGetDoc(ref: DocumentReference) {
  if (auth.currentUser?.isAnonymous) {
    try {
      return await fGetDocFromCache(ref);
    } catch (e) {
      return { exists: () => false, data: () => undefined, id: ref.id, ref } as any;
    }
  }
  
  try {
    return await fGetDoc(ref);
  } catch (e: any) {
    if (e.code === 'unavailable' || e.message?.includes('offline')) {
      return await fGetDocFromCache(ref);
    }
    throw e;
  }
}

export async function safeGetDocs`);

code = code.replace(/export async function safeGetDocs[\s\S]*?\n\}/m, `export async function safeGetDocs(query: Query) {
  if (auth.currentUser?.isAnonymous) {
    try {
      return await fGetDocsFromCache(query);
    } catch (e) {
      return { empty: true, docs: [], size: 0, forEach: () => {} } as any;
    }
  }
  
  try {
    return await fGetDocs(query);
  } catch (e: any) {
    if (e.code === 'unavailable' || e.message?.includes('offline')) {
      return await fGetDocsFromCache(query);
    }
    throw e;
  }
}`);

fs.writeFileSync('src/lib/firebase.ts', code);
console.log('patched firebase');
