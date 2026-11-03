import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { getPublicKey, saveSubscription, removeSubscription, hasSubscription, notifyUserPush } from '../services/push';

const router = Router();
router.use(requireAuth); // admins and employees can each turn on alerts for their own devices

// GET /api/push/public-key
router.get('/public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: getPublicKey() });
});

// POST /api/push/status { endpoint }  -> is this device subscribed?
router.post('/status', (req: Request, res: Response) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  res.json({ subscribed: !!endpoint && hasSubscription(endpoint) });
});

// POST /api/push/subscribe { subscription }
router.post('/subscribe', (req: Request, res: Response) => {
  const ok = saveSubscription(getAuth(req)!.id, req.body?.subscription);
  if (!ok) return res.status(400).json({ error: 'Invalid push subscription.' });
  logAudit(req, 'PUSH_ENABLE', { details: 'Phone/desktop alerts turned on for a device' });
  res.json({ ok: true });
});

// POST /api/push/unsubscribe { endpoint }
router.post('/unsubscribe', (req: Request, res: Response) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (endpoint) removeSubscription(endpoint);
  logAudit(req, 'PUSH_DISABLE', { details: 'Phone/desktop alerts turned off for a device' });
  res.json({ ok: true });
});

// POST /api/push/test  -> sends a test alert to the signed-in user's own devices
router.post('/test', (req: Request, res: Response) => {
  notifyUserPush(getAuth(req)!.id, 'Test alert', 'Alerts are working. You will be notified when something changes.');
  res.json({ ok: true });
});

export default router;
