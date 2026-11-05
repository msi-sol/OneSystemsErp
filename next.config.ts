import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  output: 'standalone',
  outputFileTracingExcludes: {
    '/*': ['./.runtime/**/*', './.env*', './outputs/**/*', './.git/**/*'],
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
