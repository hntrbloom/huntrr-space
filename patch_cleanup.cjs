const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

const cleanupCode = `
  // Auto-cleanup bad photos
  useEffect(() => {
    const photosToDelete = photos.filter(p => {
      if (!p.url || p.url === 'error' || p.url.startsWith('blob:')) return true;
      if (p.url.startsWith('idb://') && resolvedUrls[p.url] === 'error') return true;
      if (p.url.startsWith('drive://') && resolvedUrls[p.url] === 'error') return true;
      return false;
    });

    if (photosToDelete.length > 0) {
      const deleteBadPhotos = async () => {
        try {
          if (!user || user.isAnonymous) {
             const toDeleteIds = new Set(photosToDelete.map(p => p.id));
             const updated = photos.filter(p => !toDeleteIds.has(p.id));
             setPhotos(updated);
             // saveGuestData is defined below, we might need to use localStorage directly if saveGuestData is not in scope here
             localStorage.setItem('serene_photos', JSON.stringify(updated));
          } else {
             const batch = writeBatch(db);
             for (const p of photosToDelete) {
               batch.delete(doc(db, \`users/\${user.uid}/photos\`, p.id));
             }
             await batch.commit();
          }
        } catch (e) {
          console.error("Failed to auto-delete bad photos:", e);
        }
      };
      deleteBadPhotos();
    }
  }, [photos, resolvedUrls, user]);
`;

code = code.replace(/const getPhotoSrc = [\s\S]*?return url;\s*\};/, match => match + cleanupCode);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
