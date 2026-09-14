import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: "https://wpcrmfe-production.up.railway.app"
  }
};

export default nextConfig;
