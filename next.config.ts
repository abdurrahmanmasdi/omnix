import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: "https://wpcrm-production-7a72.up.railway.app"
  }
};

export default nextConfig;
