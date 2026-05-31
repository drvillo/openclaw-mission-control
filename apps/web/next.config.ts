import type { NextConfig } from "next";

const allowedDevOrigins = Array.from(
  new Set(
    (process.env.ALLOWED_DEV_ORIGINS ?? "fonkeys-mac-mini")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins,
};

export default nextConfig;
