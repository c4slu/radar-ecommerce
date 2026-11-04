import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@radar/core", "@radar/db"],
};

export default config;
