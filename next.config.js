/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable server-side features for better-sqlite3
  serverExternalPackages: ['better-sqlite3'],

  // Allow external images for next/image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
