(function initialiseLiveLook(windowObject) {
  'use strict';
  const MAX_BYTES = 8 * 1024 * 1024;
  const MIME_EXTENSIONS = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' });
  const DURATIONS = Object.freeze({ '15_minutes': 15, '30_minutes': 30, '60_minutes': 60, until_close: null });

  function validateFile(file) {
    if (!file || !MIME_EXTENSIONS[file.type]) throw new Error('Choose a JPEG, PNG, WebP, HEIC, or HEIF image.');
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_BYTES) throw new Error('Live Look photos must be 8 MB or smaller.');
    return { extension: MIME_EXTENSIONS[file.type], contentType: file.type, byteSize: file.size };
  }
  function validateCaption(value) {
    const caption = String(value || '').trim();
    if (caption.length > 80) throw new Error('Captions can be up to 80 characters.');
    return caption;
  }
  function ageLabel(value, now = Date.now()) {
    const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
    return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  }
  function remainingLabel(value, now = Date.now()) {
    const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 60000));
    return minutes < 1 ? 'expiring now' : `${minutes}m left`;
  }
  async function fingerprint(file) {
    const digest = await windowObject.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  windowObject.GoHottLiveLook = Object.freeze({ MAX_BYTES, DURATIONS, validateFile, validateCaption, ageLabel, remainingLabel, fingerprint });
}(window));
