import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn1.iconfinder.com',
        port: '',
        pathname: '/data/icons/google-s-logo/**',
      },
    ],
  },
};

export default nextConfig;
