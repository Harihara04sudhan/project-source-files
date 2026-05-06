import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ArmorPolicy SDK is consumed as a local file: dependency from a
  // sibling repo. Next/Turbopack needs to transpile it from source rather
  // than resolve a published bundle.
  transpilePackages: ["@armoriq/sdk"],
};

export default nextConfig;
