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
};

export default nextConfig;
