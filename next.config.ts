import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  transpilePackages: ['lucide-react', 'framer-motion', 'next'],
  output: "standalone",
  // File tracing sweeps data/ into the standalone bundle, which ships the
  // plaintext Xtream credentials and the user database to whoever gets the
  // build output. It is runtime state, mounted at runtime — never bundled.
  outputFileTracingExcludes: {
    '*': ['data/**'],
  },
  // Next 16.1.6's tracer misses the `require("../../../lib/metadata/…")` in
  // `server/lib/router-utils/filesystem.js`, so `node server.js` from the
  // standalone build crashes with MODULE_NOT_FOUND for `get-metadata-route`.
  // Force those two (tiny) modules into the trace.
  outputFileTracingIncludes: {
    '*': ['./node_modules/next/dist/lib/metadata/**'],
  },
};

export default nextConfig;
