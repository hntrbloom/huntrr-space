import { db } from './firebase';
import { doc, runTransaction, updateDoc } from 'firebase/firestore';
import { uploadImageToService } from './imageService';
import { processAndCompressImage } from './imageProcessor';
import { sanitizeFirestorePayload } from './firestoreUtils';

export interface PhotoTask {
  id: string;
  file?: File | Blob;
  previewUrl: string;
  type: string;
  label?: string;
  status: 'preparing' | 'compressing' | 'uploading' | 'saving' | 'saved' | 'failed' | 'interrupted';
  progress: number;
  error?: string;
  uploadedUrl?: string;
  uploadedPath?: string;
  driveFileId?: string;
  thumbDriveFileId?: string;
  thumbStoragePath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  filename?: string;
}

export interface PrintUploadStatus {
  printId: string;
  userId: string;
  isMiniCharm: boolean;
  tasks: PhotoTask[];
  overallStatus: 'processing' | 'ready' | 'partial' | 'interrupted';
}

type Listener = () => void;

class PrintUploadQueueManager {
  private activeQueue: Map<string, PrintUploadStatus> = new Map();
  private listeners: Set<Listener> = new Set();
  private maxConcurrency = 3;
  private runningUploads = 0;

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public getPrintUploadState(printId: string): PrintUploadStatus | undefined {
    return this.activeQueue.get(printId);
  }

  public getAllActiveUploads(): PrintUploadStatus[] {
    return Array.from(this.activeQueue.values());
  }

  public enqueuePrintUpload(
    userId: string,
    printId: string,
    isMiniCharm: boolean,
    tasks: PhotoTask[]
  ) {
    if (!tasks || tasks.length === 0) return;

    let existing = this.activeQueue.get(printId);
    if (!existing) {
      existing = {
        printId,
        userId,
        isMiniCharm,
        tasks: [],
        overallStatus: 'processing'
      };
      this.activeQueue.set(printId, existing);
    }

    for (const newTask of tasks) {
      const idx = existing.tasks.findIndex(t => t.id === newTask.id);
      if (idx >= 0) {
        existing.tasks[idx] = { ...newTask };
      } else {
        existing.tasks.push({ ...newTask });
      }
    }

    existing.overallStatus = 'processing';
    this.notify();
    this.processNext();
  }

  public retryFailedPhotos(printId: string) {
    const printState = this.activeQueue.get(printId);
    if (!printState) return;

    let updated = false;
    for (const task of printState.tasks) {
      if (task.status === 'failed' || task.status === 'interrupted') {
        if (!task.file) {
          task.status = 'interrupted';
          task.error = "Photo file lost after page reload. Please select photo again.";
        } else {
          task.status = 'compressing';
          task.progress = 0;
          task.error = undefined;
          updated = true;
        }
      }
    }

    if (updated) {
      printState.overallStatus = 'processing';
      this.notify();
      this.processNext();
    } else {
      this.notify();
    }
  }

  public removePendingTask(printId: string, taskId: string) {
    const printState = this.activeQueue.get(printId);
    if (!printState) return;

    const task = printState.tasks.find(t => t.id === taskId);
    if (task && task.previewUrl && task.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(task.previewUrl);
    }

    printState.tasks = printState.tasks.filter(t => t.id !== taskId);
    if (printState.tasks.length === 0) {
      this.activeQueue.delete(printId);
    }
    this.notify();
  }

  private async processNext() {
    if (this.runningUploads >= this.maxConcurrency) return;

    let targetPrint: PrintUploadStatus | null = null;
    let targetTask: PhotoTask | null = null;

    for (const printState of this.activeQueue.values()) {
      const pending = printState.tasks.find(t => t.status === 'compressing' || t.status === 'preparing');
      if (pending) {
        targetPrint = printState;
        targetTask = pending;
        break;
      }
    }

    if (!targetPrint || !targetTask) return;

    this.runningUploads++;
    const task = targetTask;
    const { userId, printId, isMiniCharm } = targetPrint;

    try {
      if (!task.file) {
        throw new Error('The selected photo is no longer available. Please select it again.');
      }

      // Step 1: Compress image (max 1600px main, 480px thumbnail, WebP format)
      task.status = 'compressing';
      task.progress = 10;
      this.notify();

      const processed = await processAndCompressImage(task.file);

      // Step 2: Upload to Firebase Storage & Google Drive
      task.status = 'uploading';
      task.progress = 30;
      this.notify();

      const uploadRes = await uploadImageToService({
        file: processed.optimizedFile,
        thumbnailFile: processed.thumbnailFile,
        userId,
        section: 'prints',
        recordId: printId,
        filename: processed.filename,
        width: processed.width,
        height: processed.height,
        onProgress: (percent) => {
          task.progress = 30 + Math.round(percent * 0.65);
          task.status = 'uploading';
          this.notify();
        }
      });

      // Requirement 6: Do not mark completed until Drive returns a valid file ID for logged-in users
      if (userId && userId !== 'guest' && !uploadRes.driveFileId) {
        throw new Error("Google Drive upload did not return a valid file ID. Please retry.");
      }

      task.status = 'saving';
      task.progress = 96;
      task.uploadedUrl = uploadRes.downloadURL;
      task.uploadedPath = uploadRes.storagePath;
      task.driveFileId = uploadRes.driveFileId || undefined;
      task.thumbDriveFileId = uploadRes.thumbDriveFileId || undefined;
      task.thumbStoragePath = uploadRes.thumbStoragePath || undefined;
      task.mimeType = uploadRes.mimeType;
      task.width = processed.width;
      task.height = processed.height;
      task.filename = processed.filename;
      this.notify();

      // Step 3: Update Firestore record with permanent metadata (never temporary blob URLs!)
      if (userId && userId !== 'guest') {
        try {
          await runTransaction(db, async (transaction) => {
            const docRef = doc(db, `users/${userId}/miniFurniture`, printId);
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) {
              throw new Error('The print record was not found while saving its photo.');
            }

            const data = sfDoc.data();
            const currentImages = Array.isArray(data.images) ? data.images : [];

            // Filter out temporary blob or data URLs
            let updatedImages = currentImages.filter((img: any) => {
              const url = typeof img === 'string' ? img : img?.url;
              const hasPermanentUrl = Boolean(url && !url.startsWith('blob:') && !url.startsWith('data:') && !url.startsWith('file:'));
              return hasPermanentUrl || Boolean(img?.driveFileId) || Boolean(img?.storagePath);
            });

            if (isMiniCharm) {
              updatedImages = updatedImages.filter((img: any) => img.type !== 'finished');
            }

            const existingIndex = updatedImages.findIndex((img: any) => img.id === task.id);
            const newPhotoMeta = sanitizeFirestorePayload({
              id: task.id,
              url: uploadRes.downloadURL || '',
              ...(uploadRes.storagePath ? { storagePath: uploadRes.storagePath } : {}),
              ...(uploadRes.driveFileId ? { driveFileId: uploadRes.driveFileId } : {}),
              ...(uploadRes.thumbDriveFileId ? { thumbDriveFileId: uploadRes.thumbDriveFileId } : {}),
              ...(uploadRes.thumbStoragePath ? { thumbStoragePath: uploadRes.thumbStoragePath } : {}),
              mimeType: uploadRes.mimeType,
              width: processed.width,
              height: processed.height,
              filename: processed.filename,
              type: task.type,
              ...(task.label ? { label: task.label } : {})
            });

            if (existingIndex >= 0) {
              updatedImages[existingIndex] = newPhotoMeta;
            } else {
              updatedImages.push(newPhotoMeta);
            }

            transaction.update(docRef, { images: updatedImages });
          });
        } catch (txErr: any) {
          console.error('Photo reached Drive but its print record could not be updated:', txErr);
          throw new Error(`Photo uploaded, but saving its print record failed: ${txErr?.message || 'Firestore update failed'}`);
        }
      }

      task.status = 'saved';
      task.progress = 100;
      task.error = undefined;
      this.notify();
    } catch (err: any) {
      console.error(`Photo upload failed for task ${task.id}:`, err);
      task.status = 'failed';
      task.error = err?.message || 'Upload failed. Please tap retry.';
      this.notify();
    } finally {
      this.runningUploads--;
      this.checkPrintCompletion(targetPrint);
      this.processNext();
    }
  }

  private async checkPrintCompletion(printState: PrintUploadStatus) {
    const total = printState.tasks.length;
    const savedCount = printState.tasks.filter(t => t.status === 'saved').length;
    const failedCount = printState.tasks.filter(t => t.status === 'failed').length;

    if (savedCount + failedCount === total) {
      if (failedCount === 0) {
        printState.overallStatus = 'ready';
      } else {
        printState.overallStatus = 'partial';
      }

      this.notify();

      if (printState.userId && printState.userId !== 'guest') {
        try {
          const docRef = doc(db, `users/${printState.userId}/miniFurniture`, printState.printId);
          await updateDoc(docRef, {
            uploadStatus: printState.overallStatus
          });
        } catch (e) {
          console.warn("Failed to update print status in Firestore:", e);
        }
      }
    }
  }
}

export const printUploadQueue = new PrintUploadQueueManager();
