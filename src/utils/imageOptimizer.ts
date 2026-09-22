/**
 * Client-side image compression & optimization utility for SHINE Relief Trust mobile app.
 * Reduces 5-15MB mobile photos to ~200-450KB while retaining high-contrast legibility
 * for school report cards, medical receipts, and household maintenance records.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.82,
};

export async function compressImage(
  file: File,
  options: CompressionOptions = DEFAULT_OPTIONS
): Promise<File> {
  // If not an image (e.g. PDF document), return untouched
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // If already very small (< 150KB), return as is
  if (file.size < 150 * 1024) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          const maxWidth = options.maxWidth || 1600;
          const maxHeight = options.maxHeight || 1600;
          let width = img.width;
          let height = img.height;

          // Scale while preserving aspect ratio
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          // Render image
          ctx.drawImage(img, 0, 0, width, height);

          // Output as JPEG with specified quality
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }

              // Create clean filename ending in .jpg
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const compressedFile = new File([blob], `${baseName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });

              // Only use compressed if it actually reduced the size
              if (compressedFile.size < file.size) {
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            options.quality || 0.82
          );
        } catch (err) {
          console.warn('Image optimization notice:', err);
          resolve(file);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Format bytes into human-readable string (e.g. 340 KB, 1.2 MB)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
