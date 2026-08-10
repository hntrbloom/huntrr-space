import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { useAuth } from '../lib/AuthContext';
import { 
  Plus, Trash2, X, Upload, Image as ImageIcon, CheckCircle2, ChevronDown, 
  FolderOpen, ArrowRightLeft, Link as LinkIcon, RefreshCw, ExternalLink, 
  Edit2, Sparkles, Check, Globe, AlertCircle, TestTube, Download
} from 'lucide-react';
import { downloadSingleImage, downloadImagesZip } from '../lib/downloadUtils';
import { uploadFileToStorage, deleteFileFromStorage, withTimeout } from '../lib/storage';
import { GUEST_SAMPLE_PINTEREST_BOARDS } from '../lib/guestSampleData';
import { DEFAULT_DRIVE_FOLDERS, getOrCreateBoardFolder, renameDriveFolder } from '../lib/driveFolderUtils';
import { getPhotoFromIDB } from '../lib/idb';
import { useGoogleDrivePicker, DriveImage } from '../hooks/useGoogleDrivePicker';
import { SmartImage } from './SmartImage';

export interface InspirationBoard {
  id: string;
  title: string;
  url?: string;
  status?: 'idle' | 'processing' | 'completed' | 'error';
  createdAt: string;
  driveFolderId?: string;
}

export interface InspirationPhoto {
  id: string;
  boardId: string;
  url: string;
  storagePath?: string;
  title?: string;
  description?: string;
  linkUrl?: string;
  createdAt: string;
  driveFileId?: string;
  driveFolderId?: string;
  mimeType?: string;
  size?: number;
  provider?: string;
}

const ImageWithFallback = ({ src, alt, className, style }: { src: string, alt: string, className?: string, style?: React.CSSProperties }) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state if src changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src || src === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center bg-surface-variant/30 text-on-surface-variant text-[11px] font-medium p-4 text-center min-h-[100px] ${className}`} style={style}>
         <ImageIcon className="w-6 h-6 mb-1 opacity-40" />
         <span>Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
      style={style}
    />
  );
};

export function InspirationView() {
  const { user, signIn } = useAuth();
  const [boards, setBoards] = useState<InspirationBoard[]>([]);
  const [photos, setPhotos] = useState<InspirationPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { showPicker } = useGoogleDrivePicker();

  const handleDrivePhotos = async (driveImages: DriveImage[], targetBoardId: string) => {
    try {
      const newPhotos: InspirationPhoto[] = driveImages.map((di, idx) => ({
        id: `photo-drive-${Date.now()}-${idx}`,
        boardId: targetBoardId,
        url: '', // We don't have a public URL, we rely on the SmartImage component and drive metadata
        storagePath: '',
        title: di.name,
        createdAt: new Date().toISOString(),
        // We'll store drive info in the photo object (requires adding to interface, we'll do this)
        driveFileId: di.fileId,
        driveFolderId: di.driveFolderId,
        mimeType: di.mimeType,
        size: di.size,
        provider: 'google-drive',
      } as any));

      if (!user || user.isAnonymous) {
        const updatedPhotos = [...newPhotos, ...photos];
        setPhotos(updatedPhotos);
        saveGuestData(boards, updatedPhotos);
      } else {
        const batch = writeBatch(db);
        newPhotos.forEach(p => {
          const docRef = doc(collection(db, `users/${user.uid}/photos`));
          p.id = docRef.id;
          batch.set(docRef, p);
        });
        await batch.commit();
      }
    } catch (err) {
      console.error("Failed to save drive photos", err);
    }
  };
  
  const [selectedBoardId, setSelectedBoardId] = useState<string>('all');
  const [showAddBoardModal, setShowAddBoardModal] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardUrl, setNewBoardUrl] = useState('');
  const [isProcessingBoard, setIsProcessingBoard] = useState(false);
  
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  
  const [activePhoto, setActivePhoto] = useState<InspirationPhoto | null>(null);
  const [editingPhotoTitle, setEditingPhotoTitle] = useState('');
  const [editingPhotoDesc, setEditingPhotoDesc] = useState('');
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardTitle, setEditingBoardTitle] = useState("");
  const [editingBoardUrl, setEditingBoardUrl] = useState("");
  const [showEditBoardModal, setShowEditBoardModal] = useState(false);

  const [showAddUrlModal, setShowAddUrlModal] = useState(false);
  const [pastedImageUrls, setPastedImageUrls] = useState('');

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [uploadErrors, setUploadErrors] = useState<Array<{ id: string; file: File; boardId: string; error: string }>>([]);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);

  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [testUploadedUrl, setTestUploadedUrl] = useState<string | null>(null);
  const [isTestRunning, setIsTestRunning] = useState(false);

  const runStorageTest = async (file: File) => {
    setIsTestRunning(true);
    setTestUploadedUrl(null);
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(msg);
      setTestLogs([...logs]);
      console.log(`[StorageTest] ${msg}`);
    };

    addLog("TEST STARTED");
    addLog(`Selected File: ${file.name} (Type: ${file.type || 'unknown'}, Size: ${(file.size / 1024).toFixed(1)} KB)`);

    const currentUser = auth.currentUser;
    const authStatus = currentUser
      ? `UID: ${currentUser.uid} | Email: ${currentUser.email || 'none'} | Anonymous: ${currentUser.isAnonymous}`
      : 'NONE (User not authenticated)';
    addLog(`Authenticated user: ${authStatus}`);

    const bucketName = (firebaseConfig as any)?.storageBucket || storage.app.options.storageBucket || 'spiritual-craft-501119-n4.firebasestorage.app';
    addLog(`Storage provider: Firebase Storage`);
    addLog(`Bucket: ${bucketName}`);

    const userId = currentUser && !currentUser.isAnonymous ? currentUser.uid : 'guest';
    const uniqueName = `test_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const destPath = `test_uploads/${userId}/${uniqueName}`;
    addLog(`Destination path: ${destPath}`);

    try {
      const storageRef = ref(storage, destPath);
      addLog("Upload request sent (calling uploadBytes)...");

      const uploadTask = (async () => {
        const snapshot = await uploadBytes(storageRef, file, {
          contentType: file.type || 'image/png'
        });
        addLog(`Upload response: HTTP 200 OK | size: ${snapshot.metadata.size} | fullPath: ${snapshot.ref.fullPath}`);
        addLog("Requesting permanent download URL...");
        const url = await getDownloadURL(snapshot.ref);
        return url;
      })();

      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Storage upload timed out after 25 seconds (network connection, bucket block, or CORS issue)"));
        }, 25000);
      });

      const permanentUrl = await Promise.race([uploadTask, timeoutPromise]);

      addLog(`Permanent URL/path: ${permanentUrl}`);
      setTestUploadedUrl(permanentUrl);
      addLog("TEST SUCCESS");
    } catch (err: any) {
      addLog("TEST FAILED");
      const errObj = {
        name: err?.name || 'Error',
        code: err?.code || 'UNKNOWN',
        message: err?.message || String(err),
        serverResponse: err?.serverResponse || null,
        customData: err?.customData || null,
        stack: err?.stack || null
      };
      addLog(`Error code: ${errObj.code}`);
      addLog(`Error message: ${errObj.message}`);
      addLog(`Full error details: ${JSON.stringify(errObj, null, 2)}`);
      console.error("Storage Test Error:", err);
    } finally {
      setIsTestRunning(false);
    }
  };

  // Resolve IDB image URLs for guest mode display
  useEffect(() => {
    let isMounted = true;

    const resolveIdbUrls = async () => {
      const idbPhotos = photos.filter(p => p.url && p.url.startsWith('idb://') && !resolvedUrls[p.url]);
      if (idbPhotos.length === 0) return;

      const newResolved: Record<string, string> = {};
      for (const photo of idbPhotos) {
        const key = photo.url.replace('idb://', '');
        try {
          const blob = await getPhotoFromIDB(key);
          if (blob) {
            newResolved[photo.url] = URL.createObjectURL(blob);
          } else {
            newResolved[photo.url] = 'error';
          }
        } catch (err) {
          console.error(`Failed to resolve IDB image ${key}:`, err);
          newResolved[photo.url] = 'error';
        }
      }

      if (isMounted && Object.keys(newResolved).length > 0) {
        setResolvedUrls(prev => ({ ...prev, ...newResolved }));
      }
    };

    resolveIdbUrls();

    return () => {
      isMounted = false;
    };
  }, [photos, resolvedUrls]);

  const getPhotoSrc = (url: string) => {
    if (!url) return '';
    if (url.startsWith('idb://')) {
      const resolved = resolvedUrls[url];
      if (resolved === 'error') return 'error';
      return resolved || '';
    }
    return url;
  };
  


  // Load Boards & Photos for Logged In User OR Guest Mode
  useEffect(() => {
    if (!user || user.isAnonymous) {
      // Guest mode or anonymous: use localStorage with GUEST_SAMPLE_PINTEREST_BOARDS fallback
      const localBoardsStr = localStorage.getItem('serene_boards');
      const localPhotosStr = localStorage.getItem('serene_photos');

      let initialBoards: InspirationBoard[] = [];
      let initialPhotos: InspirationPhoto[] = [];

      if (localBoardsStr) {
        try {
          initialBoards = JSON.parse(localBoardsStr);
        } catch (_) {}
      }

      if (localPhotosStr) {
        try {
          initialPhotos = JSON.parse(localPhotosStr);
        } catch (_) {}
      }

      if (initialBoards.length === 0) {
        initialBoards = GUEST_SAMPLE_PINTEREST_BOARDS.map(b => ({
          id: b.id,
          title: b.title,
          url: b.url,
          status: (b.status as any) || 'completed',
          createdAt: b.createdAt
        }));

        initialPhotos = GUEST_SAMPLE_PINTEREST_BOARDS.flatMap(b =>
          (b.pins || []).map(p => ({
            id: p.id,
            boardId: b.id,
            url: p.imageUrl,
            title: p.title,
            description: p.description,
            linkUrl: p.linkUrl,
            createdAt: b.createdAt
          }))
        );

        localStorage.setItem('serene_boards', JSON.stringify(initialBoards));
        localStorage.setItem('serene_photos', JSON.stringify(initialPhotos));
      }

      setBoards(initialBoards);
      setPhotos(initialPhotos);
      setLoading(false);
      return;
    }

    // Logged in mode with Firestore sync
    const boardsUnsub = onSnapshot(collection(db, `users/${user.uid}/boards`), (snap) => {
      const bds = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as InspirationBoard));
      bds.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setBoards(bds);
    }, (err) => console.error("Boards fetch error:", err));

    const photosUnsub = onSnapshot(collection(db, `users/${user.uid}/photos`), (snap) => {
      const pts = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as InspirationPhoto));
      pts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setPhotos(pts);
      setLoading(false);
    }, (err) => console.error("Photos fetch error:", err));

    return () => {
      boardsUnsub();
      photosUnsub();
    };
  }, [user]);

  // Save guest data helper
  const saveGuestData = (newBoards: InspirationBoard[], newPhotos: InspirationPhoto[]) => {
    if (!user || user.isAnonymous) {
      localStorage.setItem('serene_boards', JSON.stringify(newBoards));
      localStorage.setItem('serene_photos', JSON.stringify(newPhotos));
    }
  };

  // Process Pinterest board URL endpoint
  const processPinterestBoard = async (boardId: string, url: string, customTitle?: string) => {
    setIsProcessingBoard(true);
    try {
      const res = await fetch('/api/pinterest/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title: customTitle })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process Pinterest board');
      }

      const returnedTitle = data.title || customTitle || 'Pinterest Board';
      const returnedPins: Array<{ id: string; title: string; description: string; imageUrl: string; linkUrl: string }> = data.pins || [];

      if (!user || user.isAnonymous) {
        // Guest mode update
        const updatedBoards = boards.map(b => b.id === boardId ? {
          ...b,
          title: returnedTitle,
          url: data.url || url,
          status: 'completed' as const
        } : b);

        const newPhotosList: InspirationPhoto[] = returnedPins.map((p, idx) => ({
          id: `pin-${boardId}-${Date.now()}-${idx}`,
          boardId: boardId,
          url: p.imageUrl,
          title: p.title,
          description: p.description,
          linkUrl: p.linkUrl,
          createdAt: new Date().toISOString()
        }));

        // Filter out existing photos with same URL
        const existingUrls = new Set(photos.filter(p => p.boardId === boardId).map(p => p.url));
        const filteredNewPhotos = newPhotosList.filter(p => !existingUrls.has(p.url));

        const updatedPhotos = [...filteredNewPhotos, ...photos];
        setBoards(updatedBoards);
        setPhotos(updatedPhotos);
        saveGuestData(updatedBoards, updatedPhotos);
      } else {
        // Logged in Firestore update
        await updateDoc(doc(db, `users/${user.uid}/boards`, boardId), {
          title: returnedTitle,
          url: data.url || url,
          status: 'completed'
        });

        const existingUrls = new Set(photos.filter(p => p.boardId === boardId).map(p => p.url));
        for (const p of returnedPins) {
          if (!existingUrls.has(p.imageUrl)) {
            await addDoc(collection(db, `users/${user.uid}/photos`), {
              boardId,
              url: p.imageUrl,
              title: p.title,
              description: p.description,
              linkUrl: p.linkUrl,
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    } catch (err: any) {
      console.error("Board processing failed:", err);
      alert("Note: " + (err.message || "Failed to process Pinterest board"));
      
      // Update board status to completed anyway
      if (!user || user.isAnonymous) {
        const updatedBoards = boards.map(b => b.id === boardId ? { ...b, status: 'completed' as const } : b);
        setBoards(updatedBoards);
        saveGuestData(updatedBoards, photos);
      } else {
        await updateDoc(doc(db, `users/${user.uid}/boards`, boardId), { status: 'completed' }).catch(() => {});
      }
    } finally {
      setIsProcessingBoard(false);
    }
  };

  // Create new board (Custom or Pinterest connected)
  const handleCreateBoard = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newBoardTitle.trim() && !newBoardUrl.trim()) return;

    let title = newBoardTitle.trim() || 'Pinterest Board';
    const url = newBoardUrl.trim();

    if (boards.some(b => b.title.toLowerCase() === title.toLowerCase())) {
      title = `${title} (${boards.length + 1})`;
    }

    try {
      if (!user || user.isAnonymous) {
        const newBoardObj: InspirationBoard = {
          id: `board-${Date.now()}`,
          title: title,
          url: url || undefined,
          status: url ? 'processing' : 'completed',
          createdAt: new Date().toISOString()
        };
        const updatedBoards = [newBoardObj, ...boards];
        setBoards(updatedBoards);
        saveGuestData(updatedBoards, photos);
        setSelectedBoardId(newBoardObj.id);
        setShowAddBoardModal(false);
        setNewBoardTitle('');
        setNewBoardUrl('');

        if (url) {
          processPinterestBoard(newBoardObj.id, url, title);
        }
      } else {
        // Create folder in Drive for the new board
        let driveFolderId = undefined;
        try {
          driveFolderId = await getOrCreateBoardFolder(title, DEFAULT_DRIVE_FOLDERS.boardsFolderId);
        } catch (driveErr) {
          console.error("Failed to create drive folder for board:", driveErr);
        }
        
        const docRef = await addDoc(collection(db, `users/${user.uid}/boards`), {
          title: title,
          url: url || null,
          status: url ? 'processing' : 'completed',
          createdAt: new Date().toISOString(),
          driveFolderId: driveFolderId || null
        });

        setSelectedBoardId(docRef.id);
        setShowAddBoardModal(false);
        setNewBoardTitle('');
        setNewBoardUrl('');

        if (url) {
          processPinterestBoard(docRef.id, url, title);
        }
      }
    } catch (err: any) {
      console.error('Board creation failed:', err);
      alert('Failed to create board. ' + (err.message || ''));
    }
  };

  // Delete Board & all its photos
  const handleDeleteBoard = async (boardId: string) => {
    const boardToDelete = boards.find(b => b.id === boardId);
    if (!boardToDelete) return;

    if (!window.confirm(`Are you sure you want to delete "${boardToDelete.title}" and all its photos?`)) return;

    try {
      const boardPhotos = photos.filter(p => p.boardId === boardId);

      if (!user || user.isAnonymous) {
        const updatedBoards = boards.filter(b => b.id !== boardId);
        const updatedPhotos = photos.filter(p => p.boardId !== boardId);
        setBoards(updatedBoards);
        setPhotos(updatedPhotos);
        saveGuestData(updatedBoards, updatedPhotos);
      } else {
        const batch = writeBatch(db);
        boardPhotos.forEach(p => {
          batch.delete(doc(db, `users/${user.uid}/photos`, p.id));
          if (p.storagePath) {
            deleteFileFromStorage(p.storagePath).catch(console.error);
          }
        });
        batch.delete(doc(db, `users/${user.uid}/boards`, boardId));
        await batch.commit();
      }

      if (selectedBoardId === boardId) setSelectedBoardId('all');
    } catch (err) {
      console.error(err);
    }
  };

  // Upload multiple local photos
  const handleUploadPhotos = async (filesToUpload: FileList | File[], targetBoardOverride?: string) => {
    if (!filesToUpload || filesToUpload.length === 0) return;

    let targetBoardId = targetBoardOverride || selectedBoardId;
    let targetBoards = [...boards];

    setIsUploading(true);
    setDebugLogs([]);

    try {
      // Auto create a board if none exist
      if (targetBoardId === 'all') {
        if (targetBoards.length > 0) {
          targetBoardId = targetBoards[0].id;
        } else {
          // Create default board
          const defaultBoard: InspirationBoard = {
            id: `board-${Date.now()}`,
            title: 'My Inspiration Board',
            status: 'completed',
            createdAt: new Date().toISOString()
          };

          if (!user || user.isAnonymous) {
            targetBoards = [defaultBoard];
            setBoards(targetBoards);
            saveGuestData(targetBoards, photos);
            targetBoardId = defaultBoard.id;
          } else {
            try {
              const docRef = await withTimeout(
                addDoc(collection(db, `users/${user.uid}/boards`), {
                  title: defaultBoard.title,
                  status: 'completed',
                  createdAt: defaultBoard.createdAt
                }),
                8000,
                "Creating default board timed out"
              );
              targetBoardId = docRef.id;
            } catch (err) {
              console.error("Failed to create default board in Firestore:", err);
              targetBoardId = defaultBoard.id;
            }
          }
          setSelectedBoardId(targetBoardId);
        }
      }

      const files = Array.from(filesToUpload);
      const newErrors: Array<{ id: string; file: File; boardId: string; error: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const statusMsg = `Uploading photo ${i + 1} of ${files.length}...`;
        setUploadStatusText(statusMsg);
        setDebugLogs(prev => [...prev, `--- [${i + 1}/${files.length}] ${file.name} ---`]);

        try {
          const userId = user && !user.isAnonymous ? user.uid : 'guest';
          const storagePath = `users/${userId}/photos/`;

          // Step 1: Upload actual file to persistent storage
          const res = await uploadFileToStorage(
            userId, 
            storagePath, 
            file,
            (msg) => setDebugLogs(prev => [...prev, msg])
          );

          let title = file.name.replace(/\.[^/.]+$/, '');
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(title) || /^[0-9a-f]{32}$/i.test(title) || /^image/i.test(title)) {
            title = `Uploaded Photo ${photos.length + i + 1}`;
          }

          const photoObj: InspirationPhoto = {
            id: `photo-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            boardId: targetBoardId,
            url: res.url,
            storagePath: res.path,
            title: title,
            createdAt: new Date().toISOString()
          };

          setDebugLogs(prev => [...prev, `Database save started for ${file.name}`]);

          // Step 2: Save metadata to cloud database or guest local storage
          if (!user || user.isAnonymous) {
            setPhotos(prev => {
              const updated = [photoObj, ...prev.filter(p => p.id !== photoObj.id)];
              saveGuestData(targetBoards, updated);
              return updated;
            });
            console.log("Database save successful (Guest/IndexedDB):", photoObj.id);
            setDebugLogs(prev => [...prev, `Database save complete for ${file.name}`]);
          } else {
            try {
              const docRef = await withTimeout(
                addDoc(collection(db, `users/${user.uid}/photos`), {
                  boardId: targetBoardId,
                  url: res.url,
                  storagePath: res.path,
                  title: photoObj.title,
                  createdAt: photoObj.createdAt
                }),
                10000,
                `Database save timed out after 10s for ${file.name}`
              );
              photoObj.id = docRef.id;
              console.log("Database save successful:", docRef.id);
              setDebugLogs(prev => [...prev, `Database save complete for ${file.name}`]);
              setPhotos(prev => [photoObj, ...prev.filter(p => p.id !== photoObj.id)]);
            } catch (dbErr: any) {
              console.error("Database save failed:", file.name, dbErr);
              const dbErrMsg = `Database save failed: ${dbErr?.message || 'Database error'}`;
              setDebugLogs(prev => [...prev, dbErrMsg]);
              throw new Error(dbErrMsg);
            }
          }

          // Clear any previous error for this file
          setUploadErrors(prev => prev.filter(e => e.file.name !== file.name));
        } catch (fileErr: any) {
          const errMsg = fileErr?.message || 'Upload failed';
          console.error("Upload failed:", file.name, errMsg);
          setDebugLogs(prev => [...prev, `ERROR [${file.name}]: ${errMsg}`]);
          newErrors.push({
            id: `err-${Date.now()}-${i}`,
            file,
            boardId: targetBoardId,
            error: errMsg
          });
        }
      }

      if (newErrors.length > 0) {
        setUploadErrors(prev => [...prev, ...newErrors]);
      }
    } finally {
      setIsUploading(false);
      setUploadStatusText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Add photos by URL(s)
  const handleAddPhotosByUrl = async () => {
    if (!pastedImageUrls.trim()) return;

    let targetBoardId = selectedBoardId;
    let targetBoards = [...boards];

    if (targetBoardId === 'all') {
      if (targetBoards.length > 0) {
        targetBoardId = targetBoards[0].id;
      } else {
        const defaultBoard: InspirationBoard = {
          id: `board-${Date.now()}`,
          title: 'My Inspiration Board',
          status: 'completed',
          createdAt: new Date().toISOString()
        };
        if (!user || user.isAnonymous) {
          targetBoards = [defaultBoard];
          setBoards(targetBoards);
          saveGuestData(targetBoards, photos);
          targetBoardId = defaultBoard.id;
        } else {
          const docRef = await addDoc(collection(db, `users/${user.uid}/boards`), {
            title: defaultBoard.title,
            status: 'completed',
            createdAt: defaultBoard.createdAt
          });
          targetBoardId = docRef.id;
        }
        setSelectedBoardId(targetBoardId);
      }
    }

    const urls = pastedImageUrls
      .split(/[\n,]/)
      .map(u => u.trim())
      .filter(u => u.length > 5 && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image')));

    if (urls.length === 0) {
      alert("Please enter valid image URLs.");
      return;
    }

    const newPhotosCreated: InspirationPhoto[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const photoObj: InspirationPhoto = {
        id: `photo-url-${Date.now()}-${i}`,
        boardId: targetBoardId,
        url: url,
        title: `Saved Photo ${photos.length + i + 1}`,
        createdAt: new Date().toISOString()
      };

      if (!user || user.isAnonymous) {
        newPhotosCreated.push(photoObj);
      } else {
        await addDoc(collection(db, `users/${user.uid}/photos`), {
          boardId: targetBoardId,
          url: url,
          title: photoObj.title,
          createdAt: new Date().toISOString()
        });
      }
    }

    if (!user || user.isAnonymous) {
      const updatedPhotos = [...newPhotosCreated, ...photos];
      setPhotos(updatedPhotos);
      saveGuestData(targetBoards, updatedPhotos);
    }

    setPastedImageUrls('');
    setShowAddUrlModal(false);
  };

  // Toggle Selection
  const togglePhotoSelection = (photoId: string) => {
    const newSel = new Set(selectedPhotoIds);
    if (newSel.has(photoId)) {
      newSel.delete(photoId);
    } else {
      newSel.add(photoId);
    }
    setSelectedPhotoIds(newSel);
    if (newSel.size === 0) setIsSelectionMode(false);
  };

  const handleSelectAll = () => {
    const displayed = selectedBoardId === 'all' 
      ? photos 
      : photos.filter(p => p.boardId === selectedBoardId);

    if (selectedPhotoIds.size === displayed.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(displayed.map(p => p.id)));
    }
  };

  // Delete selected photos
  const handleDeleteSelected = async () => {
    if (selectedPhotoIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedPhotoIds.size} photo(s)?`)) return;

    try {
      if (!user || user.isAnonymous) {
        const updatedPhotos = photos.filter(p => !selectedPhotoIds.has(p.id));
        setPhotos(updatedPhotos);
        saveGuestData(boards, updatedPhotos);
      } else {
        const batch = writeBatch(db);
        for (const id of selectedPhotoIds) {
          const photo = photos.find(p => p.id === id);
          if (photo) {
            batch.delete(doc(db, `users/${user.uid}/photos`, id));
            if (photo.storagePath) {
              deleteFileFromStorage(photo.storagePath).catch(console.error);
            }
          }
        }
        await batch.commit();
      }

      setSelectedPhotoIds(new Set());
      setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Move selected photos to board
  const handleMoveSelected = async (targetBoardId: string) => {
    if (selectedPhotoIds.size === 0) return;

    try {
      if (!user || user.isAnonymous) {
        const updatedPhotos = photos.map(p => selectedPhotoIds.has(p.id) ? { ...p, boardId: targetBoardId } : p);
        setPhotos(updatedPhotos);
        saveGuestData(boards, updatedPhotos);
      } else {
        const batch = writeBatch(db);
        for (const id of selectedPhotoIds) {
          batch.update(doc(db, `users/${user.uid}/photos`, id), {
            boardId: targetBoardId
          });
        }
        await batch.commit();
      }

      setSelectedPhotoIds(new Set());
      setIsSelectionMode(false);
      setShowMoveModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Save edit board settings
  const handleSaveBoardEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBoardId || !editingBoardTitle.trim()) return;

    const title = editingBoardTitle.trim();
    const url = editingBoardUrl.trim();
    
    const board = boards.find(b => b.id === editingBoardId);
    if (!board) return;

    try {
      if (!user || user.isAnonymous) {
        const updatedBoards = boards.map(b => b.id === editingBoardId ? {
          ...b,
          title,
          url: url || undefined
        } : b);
        setBoards(updatedBoards);
        saveGuestData(updatedBoards, photos);
      } else {
        if (board.title !== title && board.driveFolderId) {
          try {
            await renameDriveFolder(board.driveFolderId, title);
          } catch (driveErr) {
            console.error("Failed to rename drive folder:", driveErr);
          }
        }
        await updateDoc(doc(db, `users/${user.uid}/boards`, editingBoardId), {
          title,
          url: url || null
        });
      }

      setShowEditBoardModal(false);
      setEditingBoardId(null);

      // If URL was added or updated, offer re-processing
      if (url) {
        processPinterestBoard(editingBoardId, url, title);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save active photo title/description edit
  const handleSavePhotoDetails = async () => {
    if (!activePhoto) return;

    const updatedPhoto = {
      ...activePhoto,
      title: editingPhotoTitle.trim(),
      description: editingPhotoDesc.trim()
    };

    try {
      if (!user || user.isAnonymous) {
        const updatedPhotos = photos.map(p => p.id === activePhoto.id ? updatedPhoto : p);
        setPhotos(updatedPhotos);
        saveGuestData(boards, updatedPhotos);
      } else {
        await updateDoc(doc(db, `users/${user.uid}/photos`, activePhoto.id), {
          title: editingPhotoTitle.trim(),
          description: editingPhotoDesc.trim()
        });
      }

      setActivePhoto(updatedPhoto);
      setIsEditingPhoto(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadPhotos(e.dataTransfer.files);
    }
  };

  const displayedPhotos = selectedBoardId === 'all' 
    ? photos 
    : photos.filter(p => p.boardId === selectedBoardId);

  const selectedBoard = boards.find(b => b.id === selectedBoardId);

  return (
    <div 
      className="flex-1 md:overflow-y-auto bg-surface relative pb-safe-nav min-h-full flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Over Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-[#FFB8CD]/30 backdrop-blur-sm border-4 border-dashed border-[#FF6B9E] flex flex-col items-center justify-center pointer-events-none animate-in fade-in">
          <Upload className="w-16 h-16 text-[#FF6B9E] mb-3 animate-bounce" />
          <h3 className="text-2xl font-bold text-on-surface">Drop photos to upload</h3>
          <p className="text-sm font-semibold text-on-surface-variant">Uploading to {selectedBoard ? selectedBoard.title : 'Inspiration Board'}</p>
        </div>
      )}

      {/* Header Area */}
      <div className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant/20 px-4 md:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[28px] font-bold font-headline-md text-on-surface flex items-center gap-2">
              Boards
            </h2>
            {selectedBoard?.url && (
              <a 
                href={selectedBoard.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[#FF6B9E] hover:underline flex items-center gap-1 mt-0.5"
              >
                <Globe className="w-3.5 h-3.5" /> Connected: {selectedBoard.url}
              </a>
            )}
            {selectedBoard?.driveFolderId && (
              <a 
                href={`https://drive.google.com/drive/folders/${selectedBoard.driveFolderId}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-semibold text-indigo-500 hover:underline flex items-center gap-1 mt-0.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open folder in Drive
              </a>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {isSelectionMode ? (
              <>
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-variant rounded-full text-xs font-bold text-on-surface transition-colors"
                >
                  {selectedPhotoIds.size === displayedPhotos.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-xs font-bold text-on-surface-variant px-1">{selectedPhotoIds.size} selected</span>
                
                <button 
                  onClick={() => setShowMoveModal(true)}
                  className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-variant rounded-full text-xs font-bold text-on-surface transition-colors flex items-center gap-1"
                  title="Move Selected"
                >
                  <ArrowRightLeft className="w-4 h-4" /> Move
                </button>
                <button 
                  onClick={handleDeleteSelected}
                  className="px-3 py-1.5 bg-[#FFB8CD]/20 hover:bg-[#FFB8CD]/30 rounded-full text-xs font-bold text-[#FF6B9E] transition-colors flex items-center gap-1"
                  title="Delete Selected"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button 
                  onClick={() => { setIsSelectionMode(false); setSelectedPhotoIds(new Set()); }}
                  className="p-1.5 bg-surface-container-high hover:bg-surface-variant rounded-full text-on-surface transition-colors ml-1"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setIsSelectionMode(true)}
                  className="px-3.5 py-2 bg-surface-container-low hover:bg-surface-container-high rounded-full text-xs font-bold text-on-surface transition-colors disabled:opacity-50"
                  disabled={displayedPhotos.length === 0}
                >
                  Select
                </button>

                <button 
                  onClick={() => setShowAddUrlModal(true)}
                  className="px-3.5 py-2 bg-surface-container-high hover:bg-surface-variant rounded-full text-xs font-bold text-on-surface transition-colors flex items-center gap-1.5"
                  title="Add Image URL"
                >
                  <LinkIcon className="w-3.5 h-3.5" /> Add URL
                </button>

                <button 
                  onClick={() => testFileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  disabled={isTestRunning}
                  title="Minimal Cloud Storage Test"
                >
                  {isTestRunning ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testing Storage...</>
                  ) : (
                    <><TestTube className="w-3.5 h-3.5" /> Test Storage Upload</>
                  )}
                </button>

                <input 
                  type="file" 
                  accept="image/*" 
                  ref={testFileInputRef} 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const file = e.target.files[0];
                      e.target.value = '';
                      runStorageTest(file);
                    }
                  }} 
                />

                <button 
                  onClick={() => {
                    const board = selectedBoardId === 'all' ? undefined : boards.find(b => b.id === selectedBoardId);
                    showPicker((images) => {
                      handleDrivePhotos(images, selectedBoardId);
                    }, true, board?.driveFolderId || DEFAULT_DRIVE_FOLDERS.boardsFolderId);
                  }}
                  className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full text-xs font-bold shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  disabled={isUploading}
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Choose from Drive
                </button>

                {displayedPhotos.length > 0 && (
                  <button 
                    onClick={async () => {
                      const boardName = selectedBoardId === 'all' ? 'All Photos' : selectedBoard?.title || 'Board_Photos';
                      const imagesToDownload = displayedPhotos.map(p => ({
                        url: p.url,
                        filename: p.title || 'photo',
                        driveFileId: p.driveFileId
                      }));
                      await downloadImagesZip(imagesToDownload, `${boardName}.zip`);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                    disabled={isUploading}
                    title="Download all displayed photos as ZIP"
                  >
                    <Download className="w-3.5 h-3.5" /> Download All
                  </button>
                )}

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-[#FFB8CD] hover:bg-[#FFB8CD]/90 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {uploadStatusText || 'Uploading...'}</>
                  ) : (
                    <><Upload className="w-3.5 h-3.5" /> Upload Photos</>
                  )}
                </button>

                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const selectedFiles = Array.from(e.target.files) as File[];
                      e.target.value = '';
                      handleUploadPhotos(selectedFiles);
                    }
                  }} 
                />
              </>
            )}
          </div>
        </div>

        {/* Boards Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          <button
            onClick={() => setSelectedBoardId('all')}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
              selectedBoardId === 'all' 
                ? 'bg-on-surface text-surface shadow-sm' 
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            All Photos <span className="ml-1 opacity-70 text-[10px] font-normal">({photos.length})</span>
          </button>
          
          {boards.map(board => {
            const count = photos.filter(p => p.boardId === board.id).length;
            const isSelected = selectedBoardId === board.id;
            return (
              <button
                key={board.id}
                onClick={() => setSelectedBoardId(board.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected 
                    ? 'bg-on-surface text-surface shadow-sm' 
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                {board.title}
                <span className="opacity-70 text-[10px] font-normal">({count})</span>
                {board.url && <Globe className="w-3 h-3 opacity-60 ml-0.5" />}
              </button>
            );
          })}

          <button
            onClick={() => setShowAddBoardModal(true)}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold bg-[#FFF0F4] text-[#FF6B9E] hover:bg-[#FFB8CD]/30 transition-colors whitespace-nowrap flex items-center gap-1 border border-[#FFB8CD]/30"
          >
            <Plus className="w-3.5 h-3.5" /> Add / Connect Board
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 md:p-8 flex-1">
        
        {testLogs.length > 0 && (
          <div className="mb-6 p-4 bg-slate-950 text-emerald-400 rounded-2xl text-xs font-mono border border-indigo-500/50 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <span className="font-bold text-indigo-300 flex items-center gap-2 text-sm">
                <TestTube className="w-4 h-4 text-indigo-400" />
                Storage Upload Test Diagnostics
              </span>
              <button 
                onClick={() => { setTestLogs([]); setTestUploadedUrl(null); }}
                className="text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 text-[11px] font-sans font-medium transition-colors"
              >
                Clear Test Logs
              </button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {testLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className={`leading-relaxed whitespace-pre-wrap break-all ${
                    log.startsWith('TEST SUCCESS') ? 'text-emerald-300 font-bold text-sm py-1' :
                    log.startsWith('TEST FAILED') ? 'text-red-400 font-bold text-sm py-1' :
                    log.startsWith('TEST STARTED') ? 'text-indigo-300 font-bold' :
                    log.startsWith('Error') || log.includes('FAILED') ? 'text-red-400' :
                    log.startsWith('Permanent URL') ? 'text-cyan-300 font-bold' :
                    'text-slate-200'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
            {testUploadedUrl && (
              <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-4">
                <img src={testUploadedUrl} alt="Uploaded test result" className="h-28 w-28 object-cover rounded-xl border-2 border-emerald-500 shadow-md" />
                <div className="flex-1 min-w-0">
                  <div className="text-emerald-400 font-bold text-xs mb-1">Uploaded Image Verification:</div>
                  <a href={testUploadedUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline text-[11px] break-all hover:text-cyan-300">
                    {testUploadedUrl}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {debugLogs.length > 0 && (
          <div className="mb-6 p-4 bg-slate-900 text-slate-100 rounded-2xl text-xs font-mono border border-slate-700 shadow-lg animate-in fade-in">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
              <span className="font-bold text-slate-300 flex items-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin text-pink-400' : 'text-slate-400'}`} />
                {isUploading ? 'Live Photo Upload Status & Logs' : 'Photo Upload Activity Log'}
              </span>
              <button 
                onClick={() => setDebugLogs([])}
                className="text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 text-[11px] font-sans font-medium transition-colors"
              >
                Dismiss Log
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {debugLogs.map((log, idx) => (
                <div key={idx} className={`leading-relaxed ${log.startsWith('ERROR') ? 'text-red-400 font-bold' : log.startsWith('---') ? 'text-pink-300 font-bold mt-1' : log.includes('complete') ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {uploadErrors.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-800">
                  {uploadErrors.length} photo(s) failed to upload:
                </p>
                <p className="text-xs text-red-600 mt-0.5 max-w-xl truncate">
                  {uploadErrors.map(e => `${e.file.name} (${e.error})`).join(', ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  const filesToRetry = uploadErrors.map(e => e.file);
                  const targetBoard = uploadErrors[0]?.boardId || selectedBoardId;
                  setUploadErrors([]);
                  handleUploadPhotos(filesToRetry, targetBoard);
                }}
                disabled={isUploading}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
                Retry Failed
              </button>
              <button
                onClick={() => setUploadErrors([])}
                className="p-1.5 hover:bg-red-100 text-red-700 rounded-lg transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {/* Selected Board Header Actions */}
        {selectedBoardId !== 'all' && selectedBoard && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/20 shadow-sm">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-xl font-bold text-on-surface flex items-center gap-2">
                  {selectedBoard.title}
                  {selectedBoard.status === 'processing' && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FFB8CD]/20 text-[#FF6B9E] font-semibold animate-pulse flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Processing Board...
                    </span>
                  )}
                </h3>
                {selectedBoard.url && (
                  <p className="text-xs text-on-surface-variant truncate max-w-md">{selectedBoard.url}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedBoard.url && (
                <button
                  onClick={() => processPinterestBoard(selectedBoard.id, selectedBoard.url!, selectedBoard.title)}
                  disabled={isProcessingBoard}
                  className="px-3 py-1.5 bg-[#FFF0F4] hover:bg-[#FFB8CD]/30 text-[#FF6B9E] text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  title="Re-sync Pinterest pins"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessingBoard ? 'animate-spin' : ''}`} /> Sync Pins
                </button>
              )}

              <button 
                onClick={() => {
                  setEditingBoardId(selectedBoard.id);
                  setEditingBoardTitle(selectedBoard.title);
                  setEditingBoardUrl(selectedBoard.url || '');
                  setShowEditBoardModal(true);
                }}
                className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>

              <button 
                onClick={() => handleDeleteBoard(selectedBoard.id)}
                className="px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Delete Board
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && displayedPhotos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-[#FFF0F4] rounded-full flex items-center justify-center mb-4">
              <ImageIcon className="w-10 h-10 text-[#FFB8CD]" />
            </div>
            <h3 className="text-xl font-bold text-on-surface mb-1">No photos in this board</h3>
            <p className="text-on-surface-variant mb-6 max-w-sm text-sm">
              Upload photos from your computer, paste image URLs, or connect a Pinterest board link to process pins!
            </p>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-[#FFB8CD] text-white rounded-full text-sm font-bold shadow-sm hover:bg-[#FFB8CD]/90 transition-all flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Upload Local Photos
              </button>
              <button 
                onClick={() => setShowAddUrlModal(true)}
                className="px-5 py-2.5 bg-surface-container-high text-on-surface rounded-full text-sm font-bold hover:bg-surface-variant transition-all flex items-center gap-2"
              >
                <LinkIcon className="w-4 h-4" /> Add Image URL
              </button>
            </div>
          </div>
        )}

        {/* Masonry Photo Grid */}
        {displayedPhotos.length > 0 && (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3 sm:gap-4 space-y-3 sm:space-y-4">
            {displayedPhotos.map(photo => {
              const isSelected = selectedPhotoIds.has(photo.id);
              const board = boards.find(b => b.id === photo.boardId);

              return (
                <div 
                  key={photo.id}
                  className={`break-inside-avoid relative rounded-xl overflow-hidden group cursor-pointer border bg-surface-container-lowest ${
                    isSelected ? 'border-[#FFB8CD] ring-2 ring-[#FFB8CD]/50' : 'border-black/5 hover:border-[#FFB8CD]/50'
                  } transition-all shadow-sm hover:shadow-md`}
                  onClick={() => {
                    if (isSelectionMode) {
                      togglePhotoSelection(photo.id);
                    } else {
                      setActivePhoto(photo);
                      setEditingPhotoTitle(photo.title || '');
                      setEditingPhotoDesc(photo.description || '');
                      setIsEditingPhoto(false);
                    }
                  }}
                >
                  <SmartImage
                    src={getPhotoSrc(photo.url)} 
                    storagePath={photo.storagePath}
                    driveFileId={photo.driveFileId}
                    isThumbnail={true}
                    alt={photo.title || "Photo"} 
                    className="w-full h-auto block bg-surface-container-low min-h-[100px] object-cover" 
                  />

                  {/* Title/Board Label Overlay on Hover */}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end text-white">
                    {photo.title && <p className="text-xs font-bold truncate leading-tight">{photo.title}</p>}
                    {board && <p className="text-[10px] text-white/80 font-medium truncate">{board.title}</p>}
                  </div>
                  
                  {/* Selection Overlay */}
                  <div className={`absolute inset-0 bg-black/20 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isSelectionMode && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        {isSelected && <div className="w-3.5 h-3.5 bg-[#FFB8CD] rounded-full shadow-sm" />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox / View Photo Modal */}
      {activePhoto && !isSelectionMode && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActivePhoto(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await downloadSingleImage(getPhotoSrc(activePhoto.url), activePhoto.title || 'Inspiration_Photo');
              }}
              className="px-3.5 py-1.5 bg-[#FF6B9E] hover:bg-[#FF6B9E]/90 text-white rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Download Original
            </button>
            {activePhoto.linkUrl && (
              <a 
                href={activePhoto.linkUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-3.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Pinterest Pin
              </a>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); setActivePhoto(null); }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div 
            className="max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 bg-black flex items-center justify-center min-h-[300px] max-h-[70vh] md:max-h-[85vh]">
              <SmartImage
                src={getPhotoSrc(activePhoto.url)} 
                storagePath={activePhoto.storagePath}
                driveFileId={activePhoto.driveFileId}
                isThumbnail={false}
                alt={activePhoto.title || "Preview"} 
                className="max-w-full max-h-full object-contain" 
              />
            </div>

            <div className="w-full md:w-80 p-6 flex flex-col justify-between bg-white overflow-y-auto">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B9E] bg-[#FFF0F4] px-2.5 py-1 rounded-full inline-block mb-3">
                  {boards.find(b => b.id === activePhoto.boardId)?.title || 'Board'}
                </span>

                {!isEditingPhoto ? (
                  <div>
                    <h3 className="text-lg font-bold text-on-surface mb-2 leading-snug">
                      {activePhoto.title || 'Inspiration Photo'}
                    </h3>
                    {activePhoto.description && (
                      <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap mb-4">
                        {activePhoto.description}
                      </p>
                    )}
                    <button 
                      onClick={() => setIsEditingPhoto(true)}
                      className="text-xs font-bold text-[#FF6B9E] hover:underline flex items-center gap-1 mt-2"
                    >
                      <Edit2 className="w-3 h-3" /> Edit details
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-on-surface-variant block mb-1">Title</label>
                      <input 
                        type="text" 
                        value={editingPhotoTitle} 
                        onChange={(e) => setEditingPhotoTitle(e.target.value)}
                        className="w-full px-3 py-1.5 border border-outline-variant rounded-lg text-sm font-semibold outline-none focus:border-[#FFB8CD]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-on-surface-variant block mb-1">Description</label>
                      <textarea 
                        rows={3}
                        value={editingPhotoDesc} 
                        onChange={(e) => setEditingPhotoDesc(e.target.value)}
                        className="w-full px-3 py-1.5 border border-outline-variant rounded-lg text-sm outline-none focus:border-[#FFB8CD]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleSavePhotoDetails}
                        className="px-3 py-1.5 bg-[#FFB8CD] text-white text-xs font-bold rounded-lg hover:bg-[#FFB8CD]/90"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setIsEditingPhoto(false)}
                        className="px-3 py-1.5 bg-surface-container-high text-xs font-bold rounded-lg hover:bg-surface-variant"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-outline-variant/30 flex items-center justify-between mt-4">
                <button
                  onClick={async () => {
                    if (!window.confirm("Delete this photo?")) return;
                    try {
                      if (!user || user.isAnonymous) {
                        const updatedPhotos = photos.filter(p => p.id !== activePhoto.id);
                        setPhotos(updatedPhotos);
                        saveGuestData(boards, updatedPhotos);
                      } else {
                        await deleteDoc(doc(db, `users/${user.uid}/photos`, activePhoto.id));
                        if (activePhoto.storagePath) {
                          deleteFileFromStorage(activePhoto.storagePath).catch(console.error);
                        }
                      }
                      setActivePhoto(null);
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Photo
                </button>

                <span className="text-[10px] text-on-surface-variant opacity-60">
                  {new Date(activePhoto.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Connect Board Modal */}
      {showAddBoardModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#FF6B9E]" /> Create / Connect Board
              </h3>
              <button onClick={() => setShowAddBoardModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">Board Name</label>
                <input 
                  type="text" 
                  value={newBoardTitle}
                  onChange={e => setNewBoardTitle(e.target.value)}
                  placeholder="e.g. Kawaii Stationery, Desk Layouts..."
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:border-[#FFB8CD] focus:ring-2 ring-[#FFB8CD]/20 text-sm font-semibold"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">
                  Pinterest Board URL <span className="font-normal text-black/40">(Optional - auto processes pins!)</span>
                </label>
                <input 
                  type="url" 
                  value={newBoardUrl}
                  onChange={e => setNewBoardUrl(e.target.value)}
                  placeholder="https://www.pinterest.com/username/boardname/"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:border-[#FFB8CD] focus:ring-2 ring-[#FFB8CD]/20 text-sm"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddBoardModal(false)} 
                  className="flex-1 py-2.5 rounded-xl font-bold bg-surface-container-high text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 rounded-xl font-bold bg-[#FFB8CD] text-white hover:bg-[#FFB8CD]/90 text-sm shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Board Modal */}
      {showEditBoardModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#FF6B9E]" /> Edit Board Settings
              </h3>
              <button onClick={() => setShowEditBoardModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBoardEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">Board Name</label>
                <input 
                  type="text" 
                  value={editingBoardTitle}
                  onChange={e => setEditingBoardTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:border-[#FFB8CD] focus:ring-2 ring-[#FFB8CD]/20 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">Pinterest Board Link</label>
                <input 
                  type="url" 
                  value={editingBoardUrl}
                  onChange={e => setEditingBoardUrl(e.target.value)}
                  placeholder="https://www.pinterest.com/username/boardname/"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:border-[#FFB8CD] focus:ring-2 ring-[#FFB8CD]/20 text-sm"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowEditBoardModal(false)} 
                  className="flex-1 py-2.5 rounded-xl font-bold bg-surface-container-high text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 rounded-xl font-bold bg-[#FFB8CD] text-white hover:bg-[#FFB8CD]/90 text-sm shadow-sm transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Photos by URL Modal */}
      {showAddUrlModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-[#FF6B9E]" /> Add Photo by URL
              </h3>
              <button onClick={() => setShowAddUrlModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">
                  Image URL(s) <span className="font-normal text-black/40">(Paste 1 or multiple URLs separated by newlines)</span>
                </label>
                <textarea 
                  rows={4}
                  value={pastedImageUrls}
                  onChange={e => setPastedImageUrls(e.target.value)}
                  placeholder="https://images.unsplash.com/...&#10;https://i.pinimg.com/..."
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:border-[#FFB8CD] focus:ring-2 ring-[#FFB8CD]/20 text-sm"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddUrlModal(false)} 
                  className="flex-1 py-2.5 rounded-xl font-bold bg-surface-container-high text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleAddPhotosByUrl}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-[#FFB8CD] text-white hover:bg-[#FFB8CD]/90 text-sm shadow-sm transition-colors"
                >
                  Save Photo(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move Photos Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col">
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#FFB8CD]" />
              Move Selected to Board
            </h3>
            <div className="flex flex-col gap-2 mb-6 max-h-[60vh] overflow-y-auto">
              {boards.map(b => (
                <button
                  key={b.id}
                  onClick={() => handleMoveSelected(b.id)}
                  className="px-4 py-3 rounded-xl font-bold text-left hover:bg-[#FFF0F4] hover:text-[#FF6B9E] transition-colors border border-transparent hover:border-[#FFB8CD]/30 flex items-center justify-between"
                >
                  {b.title}
                  <ChevronDown className="w-4 h-4 opacity-50 -rotate-90" />
                </button>
              ))}
              {boards.length === 0 && <p className="text-sm text-on-surface-variant text-center py-4">No boards exist yet.</p>}
            </div>
            <button 
              onClick={() => setShowMoveModal(false)}
              className="w-full py-3 rounded-xl font-bold bg-surface-container-high text-on-surface-variant hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
