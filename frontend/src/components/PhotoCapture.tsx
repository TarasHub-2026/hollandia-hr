import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, UserCircle2, AlertTriangle } from 'lucide-react';

const SIZE = 320; // profile pictures are saved as small square JPEGs (about 20-40 KB)

/** Centre-crops any image or video frame to a square and returns a compact JPEG data URL. */
function toSquareJpeg(source: CanvasImageSource, w: number, h: number): string {
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function fileToSquareJpeg(file: File): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file); // applies the photo's rotation on modern browsers
      const out = toSquareJpeg(bmp, bmp.width, bmp.height);
      bmp.close?.();
      return out;
    } catch { /* fall back to an <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file is not a picture we can read.'));
      i.src = url;
    });
    return toSquareJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

interface Props {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

/** Profile picture picker: take a photo with the camera, or upload a picture from the device. */
export default function PhotoCapture({ value, onChange, disabled }: Props) {
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const phoneCamRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamera(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const openCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      // Older browsers: the phone's own camera app opens through the file picker.
      phoneCamRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setCamera(true);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or use Upload picture.'
        : 'No camera was found on this device. Use Upload picture instead.');
    }
  };

  // Attach the stream once the video element is on screen.
  useEffect(() => {
    if (camera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [camera]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setError('The camera is not ready yet. Wait a moment and try again.'); return; }
    onChange(toSquareJpeg(v, v.videoWidth, v.videoHeight));
    stopCamera();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!f.type.startsWith('image/')) { setError('Please choose a picture (JPEG, PNG or WebP).'); return; }
    setBusy(true);
    try { onChange(await fileToSquareJpeg(f)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read that picture.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center shrink-0">
        {value ? <img src={value} alt="Your profile picture" className="w-full h-full object-cover" /> : <UserCircle2 size={56} className="text-gray-300" />}
      </div>
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex flex-wrap justify-center sm:justify-start gap-2">
          <button type="button" className="btn-primary" disabled={disabled || busy} onClick={openCamera}><Camera size={16} /> {value ? 'Retake with camera' : 'Take photo'}</button>
          <button type="button" className="btn-secondary" disabled={disabled || busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> {busy ? 'Reading...' : 'Upload picture'}</button>
        </div>
        <p className="text-[11px] text-gray-400">A clear photo of your face, no hat or sunglasses. JPEG, PNG or WebP.</p>
        {error && <p className="text-xs text-red-600 flex items-start gap-1 justify-center sm:justify-start"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <input ref={phoneCamRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />

      {camera && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Take your profile photo">
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">Take your photo</p>
              <button type="button" onClick={stopCamera} aria-label="Close camera" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="relative aspect-square rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/60 m-6" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1 justify-center" onClick={snap}><Camera size={16} /> Take photo</button>
              <button type="button" className="btn-secondary" onClick={stopCamera}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
