/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mhaajysljuaosdseboid.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/avatars/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Suppress "[webpack.cache.PackFileCacheStrategy] Serializing big strings" warning
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: 'error',
    };
    return config;
  },
};

export default nextConfig;
