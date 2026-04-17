export async function register() {
  // Only run in Node.js runtime (not Edge), and only once on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPushChecker } = await import('./lib/pushChecker.js');
    startPushChecker();
  }
}
