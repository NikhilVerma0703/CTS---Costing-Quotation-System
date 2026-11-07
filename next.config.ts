import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only ever used in route handlers on the server.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  devIndicators: false,
};

export default nextConfig;
