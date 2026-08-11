/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Mobile optimizations
  compress: true,
  async headers() {
    return [
      {
        // Serve the APK with the Android package MIME type so the phone treats
        // it as installable.
        source: '/downloads/:file*.apk',
        headers: [
          { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
