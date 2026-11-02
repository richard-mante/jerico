import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@jerico/ui", "@jerico/contracts"],
};

export default nextConfig;
