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
  // pino + pino-pretty are external so Next never tries to bundle pino's
  // worker-thread transport (lib/log.ts). API routes must stay on the Node
  // runtime (no `export const runtime = "edge"`) for pino to work.
  serverExternalPackages: ["bullmq", "ioredis", "@prisma/client", "pino", "pino-pretty"],
};

export default nextConfig;
