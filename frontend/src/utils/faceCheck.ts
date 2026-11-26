import type { FaceDetector } from '@mediapipe/tasks-vision';

// Checks that a profile picture shows exactly one human face. It runs in the browser with Google's MediaPipe
// BlazeFace model, served from this app (public/models and public/mediapipe), so the picture never leaves the
// device for the check. The model is only downloaded the first time someone adds a picture.

export type FaceResult = { ok: true } | { ok: false; reason: string };

const MIN_CONFIDENCE = 0.6;
const MIN_FACE_SHARE = 0.18; // the face must be at least this share of the picture's width

let detectorPromise: Promise<FaceDetector> | null = null;

function loadDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/blaze_face_short_range.tflite`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: MIN_CONFIDENCE,
      });
    })().catch(e => { detectorPromise = null; throw e; }); // let the next attempt try again
  }
  return detectorPromise;
}

/** Starts downloading the face model in the background (call when the picture screen opens). */
export function warmUpFaceCheck(): void { void loadDetector().catch(() => {}); }

export async function checkFace(image: HTMLCanvasElement): Promise<FaceResult> {
  let detector: FaceDetector;
  try { detector = await loadDetector(); }
  catch {
    return { ok: false, reason: 'The face check could not start on this device. Check your internet connection and try again, or use a different browser.' };
  }
  try {
    const faces = detector.detect(image).detections.filter(d => (d.categories[0]?.score ?? 0) >= MIN_CONFIDENCE);
    if (faces.length === 0) return { ok: false, reason: 'We could not see a human face in this picture. Use a clear photo of your face, looking at the camera, with good light.' };
    if (faces.length > 1) return { ok: false, reason: 'More than one face was found. The picture must show only you.' };
    const box = faces[0].boundingBox;
    if (!box || box.width / image.width < MIN_FACE_SHARE) return { ok: false, reason: 'Your face is too small or too far away. Move closer, or use a picture that shows your face larger.' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'The face check failed on this picture. Please try again with a different photo.' };
  }
}
