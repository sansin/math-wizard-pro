/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cloud-agnostic: produces a static export when STATIC_EXPORT=true,
  // otherwise standard Next.js server output.
  output: process.env.STATIC_EXPORT === 'true' ? 'export' : 'standalone',
  images: {
    unoptimized: process.env.STATIC_EXPORT === 'true',
  },
  // Allow the dev HMR WebSocket from LAN addresses so we can test the
  // app from a phone or another Mac on the same network without the
  // browser silently running stale code. Localhost is allowed by
  // default; we explicitly add the common private-network ranges and
  // the *.local mDNS names that Macs publish.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.0.0/16',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '*.local',
  ],
  experimental: {
    optimizePackageImports: ['recharts', 'framer-motion', 'lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
