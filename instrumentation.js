export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startPushChecker } = await import('./lib/pushChecker.js');
      startPushChecker();
    } catch {
      // Push checker failed to load — app still works without notifications
    }
  }
}
