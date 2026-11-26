import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, UserCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { checkFace, warmUpFaceCheck } from '../utils/faceCheck';

const SIZE = 320; // (square crop) profile pictures are saved as small square JPEGs (about 20-40 KB)

/** Centre-crops any image or video frame to a square canvas. */
function squareCanvas(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return canvas;
}
const toJpeg = (c: HTMLCanvasElement) => c.toDataURL('image/jpeg', 0.82);

async function fileToSquareCanvas(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file); // applies the photo's rotation on modern browsers
      const out = squareCanvas(bmp, bmp.width, bmp.height);
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
    return squareCanvas(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

interface Props {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

/**
 * Profile picture picker: take a photo with the camera, or upload a picture from the device.
 * A picture is only accepted when it shows exactly one human face; anything else is refused with a reason.
 */
export default function PhotoCapture({ value, onChange, disabled }: Props) {
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); // reading a file
  const [checking, setChecking] = useState(false); // running the face check
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const phoneCamRef = useRef<HTMLInputElement>(null);

  useEffect(() => { warmUpFaceCheck(); }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamera(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  /** Runs the face check on a picture and, only if it passes, hands it to the form. */
  const accept = async (canvas: HTMLCanvasElement): Promise<boolean> => {
    setChecking(true); setError('');
    try {
      const res = await checkFace(canvas);
      if (!res.ok) { setError(res.reason); return false; }
      onChange(toJpeg(canvas));
      return true;
    } finally { setChecking(false); }
  };

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

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setError('The camera is not ready yet. Wait a moment and try again.'); return; }
    // The camera stays open when the check fails, so the person can just try again.
    if (await accept(squareCanvas(v, v.videoWidth, v.videoHeight))) stopCamera();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!f.type.startsWith('image/')) { setError('Please choose a picture (JPEG, PNG or WebP).'); return; }
    setBusy(true);
    try { await accept(await fileToSquareCanvas(f)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read that picture.'); }
    finally { setBusy(false); }
  };

  const working = busy || checking;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center shrink-0">
        {value ? <img src={value} alt="Your profile picture" className="w-full h-full object-cover" /> : <UserCircle2 size={56} className="text-gray-300" />}
      </div>
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex flex-wrap justify-center sm:justify-start gap-2">
          <button type="button" className="btn-primary" disabled={disabled || working} onClick={openCamera}><Camera size={16} /> {value ? 'Retake with camera' : 'Take photo'}</button>
          <button type="button" className="btn-secondary" disabled={disabled || working} onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload picture</button>
        </div>
        {working && <p className="text-xs text-gray-500 flex items-center gap-1 justify-center sm:justify-start"><Loader2 size={13} className="animate-spin" /> Checking your photo...</p>}
        <p className="text-[11px] text-gray-400">Only a clear photo of your own face is accepted: one person, facing the camera, no hat or sunglasses.</p>
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
            {checking && <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> Checking your photo...</p>}
            {error && <p className="text-xs text-red-600 flex items-start gap-1"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1 justify-center" disabled={checking} onClick={snap}><Camera size={16} /> Take photo</button>
              <button type="button" className="btn-secondary" onClick={stopCamera}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
