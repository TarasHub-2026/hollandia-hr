import { Router, Request, Response } from 'express';
import { requireAdmin, getAuth } from '../middleware/security';
import { logAudit } from '../middleware/audit';
import { getPublicKey, saveSubscription, removeSubscription, hasSubscription, notifyAdminsPush } from '../services/push';

const router = Router();
router.use(requireAdmin);

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

// POST /api/push/test  -> sends a test alert to all admin devices
router.post('/test', (_req: Request, res: Response) => {
  notifyAdminsPush('Test alert', 'Alerts are working. You will be notified of new leave applications.');
  res.json({ ok: true });
});

export default router;
