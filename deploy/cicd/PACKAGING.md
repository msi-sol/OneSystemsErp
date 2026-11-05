Production releases use Next.js `output: 'standalone'` and a separately bundled Node 22 backend. After `npm ci` and `npm run build`, run:

```sh
node deploy/cicd/package-release.mjs "$RUNNER_TEMP/release-stage"
```

The stage must be empty. Keep build dependencies installed until tracing finishes. Start the frontend with `node server.js` and `PORT`/`HOSTNAME`; start the backend with `node backend/server.mjs`, `ERP_BACKEND_STANDALONE=true`, and `ERP_BACKEND_PORT`, using the release root as the working directory.

The package unions Next's standalone files with the backend and Prisma CLI dependency traces from the official `@vercel/nft` package. It includes runtime scheduling JSON, public templates, PDFKit fonts, ExcelJS/XLSX assets, immutable migrations, and the Debian/OpenSSL 3 Prisma query/schema engines. It excludes credentials, uploads, caches, and other-platform Prisma binaries from the stage. Build-host binaries remain available during the build.

Upload exclusions apply only to the mutable `uploads/` and `public/uploads/` storage roots, including their copies under `.next/standalone/`. Compiled API routes with an `uploads` segment remain in the artifact. Before packaging proceeds, every module listed in Next's `app-paths-manifest.json` must exist in the stage; a missing route stops the release before deployment.

Trace warnings are printed for review; direct backend package imports must resolve in both the build tree and the completed stage. Packaging prints the actual uncompressed size. Measure compressed archive size in CI before claiming savings, and smoke-test the frontend, backend, PDF/Excel generation, and Prisma CLI on Linux before activation. Runtime configuration is serialized into Next's standalone server; the Serwist build plugin is not loaded at startup.

Application changes still produce a fresh release, using the saved npm and `.next/cache` caches. Documentation and deployment-configuration-only pushes run the lightweight safety checks and skip the application build, artifact transfer and deployment. Changes to this packager are runtime inputs and do trigger a release. Manual workflow dispatch forces a build/deployment.

Measured comparison (artifact sizes include GitHub's small artifact wrapper; timings vary with runner and server load):

| Measurement | Previous full dependency release | Compact release with restored cache |
| --- | --- | --- |
| Successful workflow | [41656129027](https://github.com/msi-sol/OneSystemsErp/actions/runs/41656129027) | [41664869524](https://github.com/msi-sol/OneSystemsErp/actions/runs/41664869524) |
| Artifact bytes | 485,883,212 | 92,933,389 |
| End-to-end time | 361 seconds | 242 seconds |
| Deployment job | 120 seconds | 65 seconds |

The compact build generated a 433,078,050-byte expanded release. The host retains the active and immediate previous release rather than accumulating every deployment. Database backups are separate private recovery files, created only before pending migrations (plus the one-time installation backup check).

Official references: [Next.js build caching](https://nextjs.org/docs/pages/guides/ci-build-caching), [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), and [GitHub dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching).
