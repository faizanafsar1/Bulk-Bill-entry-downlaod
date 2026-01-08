/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Handle static assets
  images: {
    domains: [],
  },
  // Ensure OpenCV.js loads properly
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;

