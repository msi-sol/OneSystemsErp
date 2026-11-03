# OneSystemsErp production delivery

A push to `main` or `master` builds a Linux release in GitHub Actions and deploys it to **i-05dbf6853ca3ecb33**, serving **https://erp.mavericksolutionsinc.ph**. Manual runs are also available for those two branches. A stale queued build is skipped. Deployments are serialized and an in-progress deployment is never cancelled by a newer push.

## What happens

1. Install the committed npm lockfile with Node **22.22.1**, run deployment safety tests, generate the MySQL Prisma client, and build Next.js with webpack/Serwist.
   Both the Prisma client and CLI include EC2's Debian/OpenSSL 3 engine, and packaging verifies those binaries before upload. Native-binary generator options are excluded from the database compatibility fingerprint because they do not change tables.
2. Package the built frontend, backend source, required runtime data, and production dependencies. Production `.env` files, uploads, Git metadata, and build caches are excluded.
3. Obtain short-lived AWS credentials through GitHub OIDC. The trust policy accepts only this repository's immutable identity and `main`/`master` refs.
4. Upload a checksum-verified release to a private, encrypted S3 bucket and invoke the fixed Systems Manager document on the one production instance. No SSH private key or production database password is stored in GitHub.
5. The root-owned host installer verifies the target, archive paths, manifest, SHA-256, disk capacity, and Node version. It runs repository code as the dedicated, unprivileged `onesystemserp` account.
6. A read-only MySQL query and schema comparison must pass. Candidate frontend/backend processes are checked before activating the release. Only the two ERP services are restarted. Failed activation restores and checks the previous release.
7. Check the public HTTPS login page. Retain the current and previous host releases; expire S3 artifacts after 30 days. Before staging another release, older releases may be retired to free disk space; the running release is always preserved as the rollback target.

## Database changes

**The workflow never migrates, resets, seeds, or provisions a database.** It uses the existing `onesystemserp` schema and records on `constructpro-db`. Other schemas and applications are outside its scope.

A schema-changing commit fails the compatibility gate until an operator separately backs up, reviews, applies, and verifies a compatible migration using the existing dedicated migrator account. The initial gate records the exact existing schema comparison, including MySQL generated-column constraints used for scheduling invariants and existing relation differences; it accepts that snapshot only while both the committed schema and database difference remain identical. Review and update `/etc/onesystemserp/schema-compatibility.json` after an intentional migration. Deploy additive database changes before dependent code. Destructive changes also require a compatibility and rollback plan. Never put the RDS admin credentials or migration credentials in GitHub Actions.

## Host layout

| Purpose | Location |
| --- | --- |
| Active release symlink | `/opt/onesystemserp/current` |
| Immutable release directories | `/opt/onesystemserp/releases/<commit>-<run>-<attempt>` |
| Shared frontend uploads | `/var/lib/onesystemserp/public-uploads` |
| Shared backend uploads | `/var/lib/onesystemserp/backend-uploads` |
| Production environment | `/etc/onesystemserp/production.env` (root / ERP group only) |
| Last successful deployment metadata | `/var/lib/onesystemserp/deployment.json` |
| Original unit/environment backup | `/var/lib/onesystemserp/backups/<UTC timestamp>` |
| Original deployment retained for recovery | `/home/ubuntu/onesystemserp` |
| Root-owned deployment entrypoint | `/usr/local/sbin/onesystemserp-deploy` |
| Frontend/backend services | `onesystemserp.service`, `onesystemserp-backend.service` |

The first successful activation copies uploads again while both ERP services are stopped, then switches to shared storage. Subsequent releases reuse that storage. Keep production settings in the shared environment file; they are not replaced by a push. Public `NEXT_PUBLIC_*` values are compiled into the frontend, so build-time changes require a new build.

The original RDS CA bundles are copied into `/etc/onesystemserp/` and the shared environment points to those copies. Certificate contents and strict TLS verification are preserved, allowing the dedicated service account to connect without access to Ubuntu's home directory.

Inside the two ERP services, the selected release is mounted read-only at the original `/home/ubuntu/onesystemserp` working path. This keeps absolute upload references stable across release replacement. Other home-directory content stays hidden; uploads resolve to shared writable storage. Outside those service namespaces, the original checkout remains intact for recovery.

## Operations

See the **Production release** workflow under GitHub Actions for build/deployment results. `DEPLOYMENT_SUCCEEDED <commit>` identifies a completed host deployment. A failed build or candidate check leaves the running ERP release unchanged. A schema-check failure does not apply any SQL changes.

For an application regression that passes health checks, revert the offending commit on the production branch and push the revert. It goes through the same build and deployment checks. For urgent host recovery, an administrator can inspect `deployment.json`, switch `current` to its verified previous release, and restart only the two ERP units. The original service definitions and environment are retained in the private backup for recovery from the first transition.

The installer and AWS access policy are **not** automatically updated from repository code during ordinary releases. Changes to these privileged components require separate operator review. Production application code can read its own environment; anyone allowed to push to `main` or `master` must therefore be trusted to deploy production code. Configure repository branch protections according to your team's review policy.

The initial setup used a separate checkout so existing uncommitted work on the original local `main` was preserved. Remote `main` was aligned with the MySQL release already running in production before enabling CI/CD; reconcile existing local work with that remote history before pushing it.
