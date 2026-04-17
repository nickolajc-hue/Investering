import webpush from 'web-push';
import { fetchNewsForSymbols } from './news.js';
import {
  getSubscriptions,
  getPushState,
  savePushState,
  removeExpiredSubscriptions,
} from './pushStore.js';

webpush.setVapidDetails(
  'mailto:app@aktiepanel.local',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function checkAndPush() {
  const subs = getSubscriptions();
  if (subs.length === 0) return { sent: 0, newCount: 0 };

  // Collect all unique symbols tracked by any subscription
  const symbols = [...new Set(subs.flatMap((s) => s.symbols || []))];
  if (symbols.length === 0) return { sent: 0, newCount: 0 };

  let news;
  try {
    news = await fetchNewsForSymbols(symbols);
  } catch {
    return { sent: 0, newCount: 0 };
  }

  const state = getPushState();
  const sentLinks = new Set(state.sentLinks || []);

  const newArticles = news.filter((a) => !sentLinks.has(a.link));
  if (newArticles.length === 0) {
    savePushState({ ...state, lastCheck: new Date().toISOString() });
    return { sent: 0, newCount: 0 };
  }

  const expired = [];
  let sent = 0;

  for (const sub of subs) {
    const subSymbols = new Set(sub.symbols || symbols);
    const relevant = newArticles.filter((a) => subSymbols.has(a.symbol));
    if (relevant.length === 0) continue;

    const first = relevant[0];
    const extra = relevant.length - 1;
    const payload = JSON.stringify({
      title: `${first.symbol}: ${first.title}`,
      body: extra > 0 ? `+${extra} ${extra === 1 ? 'nyhed mere' : 'nyheder mere'}` : '',
      url: first.link,
    });

    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        expired.push(sub.subscription.endpoint);
      }
    }
  }

  if (expired.length > 0) removeExpiredSubscriptions(expired);

  const updatedLinks = [
    ...new Set([...sentLinks, ...newArticles.map((a) => a.link)]),
  ].slice(-2000);
  savePushState({ sentLinks: updatedLinks, lastCheck: new Date().toISOString() });

  return { sent, newCount: newArticles.length };
}

// Background interval — called once from instrumentation.js
let started = false;
export function startPushChecker() {
  if (started) return;
  started = true;
  // First check after 1 min (let server settle), then every 5 min
  setTimeout(() => {
    checkAndPush().catch(() => {});
    setInterval(() => checkAndPush().catch(() => {}), 5 * 60 * 1000);
  }, 60_000);
}
