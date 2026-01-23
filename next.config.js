/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable server-side features for better-sqlite3
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
