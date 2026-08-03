/**
 * Image compression utilities for Sommeasy.
 *
 * compressImage() — resize + JPEG compress before upload to the
 * Claude Vision routes (/api/scan-label, /api/parse-wine-list).
 */

/**
 * Compress an image file to a JPEG Blob (max 1600px, 0.82 quality).
 * Handles HEIC/HEIF via Canvas fallback.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Compression failed")); return; }
        resolve(blob);
      }, "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
