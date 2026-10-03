const LOCAL_DASHBOARD = 'http://localhost:3001';

/** The one parser for FRONTEND_URL (comma-separated origins) used by CORS, CSRF and Socket.IO. */
export function parseFrontendOrigins(
  raw: string | undefined = process.env.FRONTEND_URL,
): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length ? origins : [LOCAL_DASHBOARD];
}
