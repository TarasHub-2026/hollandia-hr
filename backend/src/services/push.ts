import webpush from 'web-push';
import { db } from '../db/database';

// Web Push for the HR admin's phone/computer. The VAPID key pair is created on first use and kept in the
// database (on the Railway volume), so there is nothing to configure.

let ready = false;
let publicKey = '';

function init(): void {
  if (ready) return;
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const get = (k: string) => (db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(k) as { value: string } | undefined)?.value;
  let pub = get('vapid_public');
  let priv = get('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    const set = db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`);
    set.run('vapid_public', pub);
    set.run('vapid_private', priv);
    console.log('[push] Generated new VAPID keys.');
  }
  const hrMail = (process.env.HR_NOTIFY_EMAIL || '').split(',')[0].trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim() || (hrMail ? `mailto:${hrMail}` : (process.env.APP_URL || 'https://tarashub-2026.github.io/hollandia-hr/').trim());
  webpush.setVapidDetails(subject, pub, priv);
  publicKey = pub;
  ready = true;
}

export function getPublicKey(): string {
  init();
  return publicKey;
}

export function saveSubscription(adminId: string, sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }): boolean {
  init();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  if (!/^https:\/\//.test(sub.endpoint)) return false;
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, admin_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(endpoint) DO UPDATE SET admin_id = excluded.admin_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(sub.endpoint, adminId, sub.keys.p256dh, sub.keys.auth);
  return true;
}

export function removeSubscription(endpoint: string): void {
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export function hasSubscription(endpoint: string): boolean {
  return !!db.prepare(`SELECT 1 FROM push_subscriptions WHERE endpoint = ?`).get(endpoint);
}

/** Sends a push to every subscribed admin device. Never throws. */
export function notifyAdminsPush(title: string, body: string, url = './'): void {
  try {
    init();
    const subs = db.prepare(`
      SELECT ps.endpoint, ps.p256dh, ps.auth FROM push_subscriptions ps
      JOIN employees e ON e.id = ps.admin_id WHERE e.role = 'ADMIN'
    `).all() as { endpoint: string; p256dh: string; auth: string }[];
    const payload = JSON.stringify({ title, body, url });
    for (const s of subs) {
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
        .catch((e: { statusCode?: number; message?: string }) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) removeSubscription(s.endpoint); // device unsubscribed
          else console.warn('[push] send failed:', e?.statusCode || e?.message);
        });
    }
  } catch (e) {
    console.warn('[push] could not send:', e instanceof Error ? e.message : e);
  }
}
