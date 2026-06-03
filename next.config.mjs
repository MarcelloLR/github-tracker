/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // GitHub avatars + repo OG images
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
    ],
  },
  // The BullMQ worker is a separate process (src/worker/index.ts); it is not bundled
  // by Next. Keep server-only packages external to avoid accidental client imports.
  serverExternalPackages: ["bullmq", "ioredis", "@prisma/client"],
};

export default nextConfig;
