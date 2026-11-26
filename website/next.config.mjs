/** Same default as src/lib/api/core.ts → BACKEND_URL. */
const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://10.10.26.159:9990/api/v1').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
/**
 * Content-Security-Policy. What it locks down: script origins (no third-party scripts can load),
 * plugins/objects, <base> hijacking, form posts to other sites, and framing (clickjacking).
 *
 * Deliberate allowances:
 *  - script 'unsafe-inline': Next's App Router inlines its bootstrap scripts; nonces would force every
 *    page to render dynamically (no static/ISR). 'unsafe-eval' only in dev (React Refresh).
 *  - style 'unsafe-inline': antd injects its styles at runtime.
 *  - img/media/connect over https: uploads go straight to the S3 presigned URL and user content can
 *    live on the CDN; the backend origin (http in dev) is added explicitly for API static files + socket.
 */
const isProd = process.env.NODE_ENV === 'production';
const backend = new URL(BACKEND_URL);
const backendOrigin = backend.origin;
const backendWs = `${backend.protocol === 'https:' ? 'wss:' : 'ws:'}//${backend.host}`;
// Dev serves uploads/sockets over plain http from several local hosts (localhost, LAN IP).
const devHttp = isProd ? '' : ' http: ws:';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${backendOrigin}${devHttp}`,
  `media-src 'self' blob: https: ${backendOrigin}${devHttp}`,
  "font-src 'self' data:",
  `connect-src 'self' https: wss: ${backendOrigin} ${backendWs}${devHttp}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Only meaningful over HTTPS; browsers ignore it on plain http (local / LAN dev).
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

/**
 * Hosts next/image may optimize: backend `/static` uploads (from NEXT_PUBLIC_API_URL), the S3/CDN
 * public base URL(s) in NEXT_PUBLIC_IMAGE_HOSTS (comma-separated), and the demo image hosts.
 */
const toPattern = (raw) => {
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return { protocol: u.protocol.replace(':', ''), hostname: u.hostname, ...(u.port ? { port: u.port } : {}) };
  } catch {
    return null;
  }
};
const imageRemotePatterns = [
  'https://images.unsplash.com',
  'https://plus.unsplash.com',
  'https://randomuser.me',
  BACKEND_URL,
  ...(process.env.NEXT_PUBLIC_IMAGE_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
]
  .map(toPattern)
  .filter(Boolean);

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  /**
   * Browser → /api/v1/* (same origin) → backend. Keeps the httpOnly refresh cookie first-party,
   * so a hard reload never logs the user out, and removes CORS from browser API calls.
   */
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${BACKEND_URL}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: {
    // Tree-shake big icon / UI barrels so pages only ship what they import.
    optimizePackageImports: ['lucide-react', 'antd', '@ant-design/icons'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Keep in sync with components/shared/RemoteImage.tsx (same env vars).
    remotePatterns: imageRemotePatterns,
  },

};

export default nextConfig;

