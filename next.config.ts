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
  transpilePackages: ['lucide-react', 'framer-motion', 'idb', 'next'],
  output: "standalone",
};

export default nextConfig;
