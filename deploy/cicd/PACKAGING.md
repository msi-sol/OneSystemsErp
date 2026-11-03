Production releases use Next.js `output: 'standalone'` and a separately bundled Node 22 backend. After `npm ci` and `npm run build`, run:

```sh
node deploy/cicd/package-release.mjs "$RUNNER_TEMP/release-stage"
```

The stage must be empty. Keep build dependencies installed until tracing finishes. Start the frontend with `node server.js` and `PORT`/`HOSTNAME`; start the backend with `node backend/server.mjs`, `ERP_BACKEND_STANDALONE=true`, and `ERP_BACKEND_PORT`, using the release root as the working directory.

The package unions Next's standalone files with the backend and Prisma CLI dependency traces from the official `@vercel/nft` package. It includes runtime scheduling JSON, public templates, PDFKit fonts, ExcelJS/XLSX assets, immutable migrations, and the Debian/OpenSSL 3 Prisma query/schema engines. It excludes credentials, uploads, caches, and other-platform Prisma binaries from the stage. Build-host binaries remain available during the build.

Trace warnings are printed for review; direct backend package imports must resolve in both the build tree and the completed stage. Packaging prints the actual uncompressed size. Measure compressed archive size in CI before claiming savings, and smoke-test the frontend, backend, PDF/Excel generation, and Prisma CLI on Linux before activation. Runtime configuration is serialized into Next's standalone server; the Serwist build plugin is not loaded at startup.
