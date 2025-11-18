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
  // Silence workspace root inference warning when repo has multiple lockfiles
  outputFileTracingRoot: process.cwd(),
  // Polyfills for WebTorrent in browser builds
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve?.fallback || {}),
      fs: false,
      path: require.resolve('path-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      crypto: require.resolve('crypto-browserify'),
      os: require.resolve('os-browserify/browser'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      url: require.resolve('url/')
    };
    config.plugins = config.plugins || [];
    // Inject Buffer and process globals
    const webpack = require('webpack');
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: ['process']
      })
    );
    
    // Ensure crypto polyfill is properly configured
    // WebTorrent needs crypto support for parsing torrent files
    config.resolve.alias = config.resolve.alias || {};
    // Don't alias crypto to false - use the polyfill
    if (!config.resolve.alias.crypto) {
      // crypto-browserify should be used via fallback, but ensure it's available
    }
    
    return config;
  }
};

export default nextConfig;
