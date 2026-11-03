import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // TODO: Remove this after fixing all migration-generated TypeScript errors
    ignoreBuildErrors: true,
  },
  turbopack: {},
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async redirects() {
    return [
      {
        source: '/projects/:projectId/accomplishments',
        destination: '/progress/:projectId/accomplishments',
        permanent: true,
      },
    ];
  },
};

export default withSerwist(nextConfig);
