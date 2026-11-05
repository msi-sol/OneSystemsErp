# OneSystemsErp production delivery

A production application change on `main` or `master` builds a Linux release in GitHub Actions and deploys it to **i-05dbf6853ca3ecb33**, serving **https://erp.mavericksolutionsinc.ph**. Docs and deployment-configuration-only pushes run lightweight checks without rebuilding or restarting the website; test-only pushes run tests without deploying. Manual workflow runs force a build/deployment. Queued releases are skipped when newer application changes exist. Deployments are serialized and an in-progress deployment is never cancelled by a newer push.

Every push also runs `deploy/cicd/literal-password-policy.test.mjs`, which fails on a literal password or password hash in tracked code. It reports file, line and rule only. Local scripts read `LOCAL_TEST_PASSWORD` instead, and any script that writes a password must call `scripts/lib/local-database-guard.mjs` first.

## What happens

1. Restore npm and Next.js compiler caches, install the committed lockfile with Node **22.22.1**, run the focused production tests, generate the MySQL Prisma client, and build Next.js with webpack/Serwist.
   Both the Prisma client and CLI include EC2's Debian/OpenSSL 3 engine, and packaging verifies those binaries before upload. Native-binary generator options are excluded from the database compatibility fingerprint because they do not change tables.
2. Package Next standalone output, the bundled backend, required runtime assets and traced dependencies. Full `node_modules` and TypeScript backend source are not copied. Production `.env` files, uploads, Git metadata, build caches and nonproduction native engines are excluded. See [PACKAGING.md](PACKAGING.md).
3. Obtain short-lived AWS credentials through GitHub OIDC. The trust policy accepts only this repository's immutable identity and `main`/`master` refs.
4. Upload a checksum-verified release to a private, encrypted S3 bucket and invoke the fixed Systems Manager document on the one production instance. No SSH private key or production database password is stored in GitHub.
5. The root-owned host installer verifies the target, archive paths, manifest, SHA-256, disk capacity, and Node version. It runs repository code as the dedicated, unprivileged `onesystemserp` account.
6. If automatic migrations are enabled on the host, validate the restricted migrator account, immutable history, SQL scope, and existing database state; back up the ERP schema before pending migrations and run `prisma migrate deploy`. Read-only application checks and staged frontend/backend health checks must then pass. Only the two ERP services are restarted. Failed activation restores and checks the previous application release.
7. Check the public HTTPS login page. Retain the current and previous host releases; expire S3 artifacts after 30 days. Before staging another release, older releases may be retired to free disk space; the running release is always preserved as the rollback target.

## Database changes

Automatic migrations use the **existing `onesystemserp_migrator` account**, whose only database privileges are on `onesystemserp.*` on `constructpro-db`. The hook never uses the RDS admin account, provisions a database, resets a database, runs development migrations, or seeds records. Other project schemas have no granted write access. Credentials remain on EC2, separate from the web application's account and GitHub.

After reviewing the host configuration, an operator enables the hook with `install-auto-migrations.sh`. It verifies a zero-pending run and a private backup before setting `automatic_migrations: true` in `/etc/onesystemserp/deploy.json`. The fixed runner uses a separate non-login OS account, verified TLS, restricted grants, no active roles, and blocked EC2 metadata access. Commit new timestamped directories under `prisma/migrations/`; the deployed `20261103000000_mysql_baseline` is immutable and never replayed. Do not introduce a replacement migration history or commit credentials.

Each run rejects edited/removed/failed migration history, SQL that names other schemas or changes accounts/permissions, and changes to protected scheduling invariants. The exact existing compatibility difference must remain unchanged before and after migrations; it is never automatically accepted again as new drift. A root-owned applied-schema snapshot advances only after successful database verification, allowing a corrective application release after an application rollback.

Private compressed backups are created under `/var/lib/onesystemserp/migrations/backups` before pending SQL. They are not uploaded to GitHub or shared with other apps. Disk-space and backup failures stop before migration. **MySQL DDL is not automatically rolled back:** migration failure can leave partial changes, and reverting application code does not undo SQL. Failed history blocks subsequent automatic attempts until an operator repairs/resolves it. Prefer backward-compatible additive migrations and review destructive changes before merging.

## Host layout

| Purpose | Location |
| --- | --- |
| Active release symlink | `/opt/onesystemserp/current` |
| Immutable release directories | `/opt/onesystemserp/releases/<commit>-<run>-<attempt>` |
| Shared frontend uploads | `/var/lib/onesystemserp/public-uploads` |
| Shared backend uploads | `/var/lib/onesystemserp/backend-uploads` |
| Production environment | `/etc/onesystemserp/production.env` (root / ERP group only) |
| Isolated migrator environment | `/etc/onesystemserp-migrations/migration.env` |
| Verified database schema snapshot | `/etc/onesystemserp-migrations/applied-schema.prisma` |
| Private migration backups/results | `/var/lib/onesystemserp/migrations/` |
| Last successful deployment metadata | `/var/lib/onesystemserp/deployment.json` |
| Original unit/environment backup | `/var/lib/onesystemserp/backups/<UTC timestamp>` |
| Original deployment retained for recovery | `/home/ubuntu/onesystemserp` |
| Root-owned deployment entrypoint | `/usr/local/sbin/onesystemserp-deploy` |
| Frontend/backend services | `onesystemserp.service`, `onesystemserp-backend.service` |

The first successful activation copies uploads again while both ERP services are stopped, then switches to shared storage. Subsequent releases reuse that storage. Keep production settings in the shared environment file; they are not replaced by a push. Public `NEXT_PUBLIC_*` values are compiled into the frontend, so build-time changes require a new build.

The original RDS CA bundles are copied into `/etc/onesystemserp/` and the shared environment points to those copies. Certificate contents and strict TLS verification are preserved, allowing the dedicated service account to connect without access to Ubuntu's home directory.

Inside the two ERP services, the selected release is mounted read-only at the original `/home/ubuntu/onesystemserp` working path. This keeps absolute upload references stable across release replacement. Other home-directory content stays hidden; uploads resolve to shared writable storage. Outside those service namespaces, the original checkout remains intact for recovery.

## Application uploads

Production file uploads use the private bucket
`onesystemserp-uploads-173677044880-us-east-1` in `us-east-1`, separate from
deployment artifacts. Block Public Access is enabled, ownership is
bucket-owner-enforced, default encryption is SSE-S3, and versioning is enabled.
The existing EC2 role `OneSystemsErpZenithArchiveRole` has the additive inline
policy `OneSystemsErpPrivateUploads`: GetBucketLocation on this bucket and
GetObject/PutObject/DeleteObject on its objects over HTTPS. Other role policies
are preserved; no access keys are installed.

The production environment sets `AWS_REGION`, `AWS_S3_BUCKET_NAME` and
`S3_BUCKET_NAME` (both aliases name this upload bucket). Its previous settings
are retained at
`/var/lib/onesystemserp/backups/s3-uploads-20261105/production.env`. To restore
the environment, restore that file and restart only the two ERP services; retain
S3 objects and local originals for recovery. Uploads have no automatic expiry
lifecycle and no DeleteObjectVersion grant.

BOQ originals retain permission-checked original-download routes. Other files
use durable `/api/uploads/file?key=...` URLs, with uploader/module/project context
in private metadata and authorization before returning bytes. Trusted document
integrations receive short-lived signed URLs, which are not persisted in database
fields. Source bytes remain unchanged before extraction.

Outside production, new files use private `.runtime/` storage even when S3
settings exist. Local document integrations use expiring signed app URLs. Legacy
local files remain readable and are not deleted. Legacy external reads permit
the previous S3 defaults and Vercel Blob hosts; an explicitly reviewed additional
historical host can be configured with `LEGACY_UPLOAD_HOSTS`. Production uploads
never fall back to local files, another provider, or placeholder URLs.

The shared handler covers BOQ/work-package sources, legacy BOQ intake, documents,
delivery proofs, accomplishment/billing originals and edits, quotations, payroll
imports, project/materials/billing templates, notebook references and knowledge
source binaries. Analyze/preview steps keep their existing no-commit behavior;
JSON-only text ingestion is not a file upload. Storage routing introduces no
schema, approval or calculation change.

## Operations

See the **Production release** workflow under GitHub Actions for build/deployment results. `DEPLOYMENT_SUCCEEDED <commit>` identifies a completed host deployment. Preflight/history/scope failures stop before SQL. Migration or post-migration verification failures stop application activation and preserve private diagnostics/recovery backups; SQL already applied is not undone. A failed build or staged application check does not replace the running application release.

For an application regression that passes health checks, revert the offending commit on the production branch and push the revert. It goes through the same build and deployment checks. For urgent host recovery, an administrator can inspect `deployment.json`, switch `current` to its verified previous release, and restart only the two ERP units. The original service definitions and environment are retained in the private backup for recovery from the first transition.

The installer and AWS access policy are **not** automatically updated from repository code during ordinary releases. Changes to these privileged components require separate operator review. Production application code can read its own environment; anyone allowed to push to `main` or `master` must therefore be trusted to deploy production code. Configure repository branch protections according to your team's review policy.

Production changes were integrated in an isolated checkout. The original local `main` was then fast-forwarded to GitHub `main`; excluded local demo/configuration changes remain in the named backup stash and the private local snapshot.
