import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer runs only in the PDF route handler on the server.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Drawing-sheet uploads are parsed in a server action.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
