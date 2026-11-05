Both the Next.js app and AWS backend use the MySQL schema and migrations in the
repository root: `prisma/schema.prisma` and `prisma/migrations/`.

From `apps/aws-backend`, use `npm run db:generate`, `npm run db:validate`, or
`npm run db:status`. These forward to the repository root so they load the same
schema, environment and generated client. Do not create a second schema here.

For local backend development, run `npm run db:generate` first. Production
packaging installs dependencies and generates the client at the repository root.
