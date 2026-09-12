/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal .next/standalone server (only traced deps) for Docker deploys.
  output: 'standalone',
};

export default nextConfig;
