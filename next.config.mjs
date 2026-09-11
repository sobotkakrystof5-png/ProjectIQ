/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // PDF faktury chodí server actionou jako FormData. Výchozí 1 MB by
      // propustilo jen ty nejmenší. Strop aplikace je 4 MB (MAX_PDF_BYTES
      // v lib/invoice-constants.ts), tady je rezerva na multipart overhead.
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

export default nextConfig
