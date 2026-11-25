import type { NextConfig } from "next";

// Extra hosts allowed to load dev-server assets (e.g. a Tailscale IP when testing from a phone).
const extraDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  devIndicators: false,
  // AGENTS.md is written by hand; `next dev` would otherwise add its own block.
  agentRules: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: {
    ignoreBuildErrors: process.env.NEXT_E2E_SKIP_BUILD_TYPECHECK === "1",
  },
  allowedDevOrigins: ["127.0.0.1", ...extraDevOrigins],
  poweredByHeader: false,
  experimental: {
    typedEnv: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
