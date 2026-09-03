import { Router, Request, Response } from 'express';
import { syncFromCognito, getLastSyncStatus } from '../services/cognitoSync';

const router = Router();

// POST /api/sync/cognito — trigger a full sync from Cognito Forms
router.post('/cognito', async (_req: Request, res: Response) => {
  try {
    const result = await syncFromCognito();
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    console.error('[Sync] Error:', msg);
    res.status(500).json({ error: msg });
  }
});

// GET /api/sync/cognito/status — return last sync result
router.get('/cognito/status', (_req: Request, res: Response) => {
  const last = getLastSyncStatus();
  if (!last) return res.json({ synced: false, message: 'No sync has been run yet.' });
  res.json({ synced: true, ...last });
});

export default router;