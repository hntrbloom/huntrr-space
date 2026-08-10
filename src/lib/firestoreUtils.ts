/**
 * Recursively sanitizes a payload object or array for Firestore writes.
 * Removes any key whose value is strictly `undefined`, and removes `undefined` elements from arrays.
 * Preserves valid values including null, false, 0, empty strings, Date, Timestamp, serverTimestamp(), deleteField().
 * Reports/logs the exact property path containing `undefined` or invalid values.
 */
export function sanitizeFirestorePayload<T>(obj: T, path = ''): T {
  if (obj === undefined || obj === null) {
    return obj;
  }

  // Primitive non-object types
  if (typeof obj !== 'object') {
    return obj;
  }

  // Preserve Date instances
  if (obj instanceof Date) {
    return obj;
  }

  // Sanitize Arrays
  if (Array.isArray(obj)) {
    const cleanedArray: any[] = [];
    obj.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (item === undefined) {
        console.warn(`[Firestore Payload Diagnostics] Removed undefined array element at path: "${itemPath}"`);
      } else {
        cleanedArray.push(sanitizeFirestorePayload(item, itemPath));
      }
    });
    return cleanedArray as unknown as T;
  }

  // Preserve Firestore FieldValue or Timestamp or custom class instances
  if (
    obj.constructor &&
    obj.constructor.name !== 'Object' &&
    (obj.constructor.name.includes('FieldValue') ||
     obj.constructor.name.includes('Timestamp') ||
     typeof (obj as any).toMillis === 'function')
  ) {
    return obj;
  }

  const cleanedObj: Record<string, any> = {};
  for (const key of Object.keys(obj as Record<string, any>)) {
    const val = (obj as Record<string, any>)[key];
    const keyPath = path ? `${path}.${key}` : key;

    if (val === undefined) {
      console.warn(`[Firestore Payload Diagnostics] Removed undefined property at path: "${keyPath}"`);
    } else if (val instanceof File || val instanceof Blob) {
      console.warn(`[Firestore Payload Diagnostics] Removed File/Blob object from Firestore payload at path: "${keyPath}"`);
    } else if (typeof val === 'function') {
      console.warn(`[Firestore Payload Diagnostics] Removed function from Firestore payload at path: "${keyPath}"`);
    } else {
      cleanedObj[key] = sanitizeFirestorePayload(val, keyPath);
    }
  }

  return cleanedObj as T;
}

/**
 * Diagnostic tool to inspect an object and return a list of all property paths that contain `undefined`.
 */
export function findUndefinedPaths(obj: any, path = ''): string[] {
  if (obj === undefined) {
    return [path || 'root'];
  }

  if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
    return [];
  }

  const undefinedPaths: string[] = [];

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      const itemPath = `${path}[${idx}]`;
      if (item === undefined) {
        undefinedPaths.push(itemPath);
      } else {
        undefinedPaths.push(...findUndefinedPaths(item, itemPath));
      }
    });
    return undefinedPaths;
  }

  if (
    obj.constructor &&
    obj.constructor.name !== 'Object' &&
    (obj.constructor.name.includes('FieldValue') || obj.constructor.name.includes('Timestamp'))
  ) {
    return [];
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const keyPath = path ? `${path}.${key}` : key;
    if (val === undefined) {
      undefinedPaths.push(keyPath);
    } else if (val !== null && typeof val === 'object') {
      undefinedPaths.push(...findUndefinedPaths(val, keyPath));
    }
  }

  return undefinedPaths;
}
