This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## BOQ Workspace

Open **BOQ Workspace** in the sidebar or from Projects (`/boq`). Analyze an
XLSX workbook, select its sheet and column mapping, then confirm the source.
The workspace replaces the blank-template download panel and groups accessible
projects into **BOQ Action Required** and **Approved BOQs**.

Each project has separate **BOQ** and **Work Packages** modules. BOQ draft
editing leads to written Engineer review and PM approval/locking. Work Packages
provides package dates and completion weights, split BOQ scope, sequence links,
locations, constraints, resource budgets, and Engineer review → PM baseline
approval. Revisions retain the previous active baseline until approval. Corrected
BOQ sources/readings retain evidence and explicit carry decisions. Approved work
packages include look-ahead, weekly commitments, daily measured work, and real
material requirements with warehouse stock, reservations, transfers and
procurement/issuance integration.

Analysis creates no records. Confirmation preserves the original and creates a
canonical draft BOQ. Workflow, compatibility and storage requirements are owned
by the [scheduling architecture](docs/architecture/universal-project-intake-and-scheduling.md#11-boq-workspace-intake).

BOQ, DUPA and benchmark uploads use the built-in reader first. Recognizable Excel
columns and Word/PDF tables do not require an AI call. If the layout cannot be
recognized, the server uses OpenAI as a helper when `OPENAI_API_KEY` is configured
in `.env`; `OPENAI_UPLOAD_MODEL` can optionally override `gpt-6-luna`.
For unfamiliar Excel layouts, AI suggests column indexes while the system reads
every original row and validates its values. Unsupported document layouts use
an explicitly marked, reviewable AI extraction. Financial validation errors,
unsafe files and ambiguous worksheet choices still require correction. AI never
approves an import, fills missing prices, or bypasses the approval workflow.

For the practice draft and the complete manual flow, follow the
[local walkthrough](docs/architecture/universal-project-intake-and-scheduling.md#manual-local-walkthrough).

## Getting Started

Both applications use **MySQL through Prisma**. The single schema is
`prisma/schema.prisma`; the AWS backend shares its generated client. The files
under `prisma/postgresql-migrations/` are historical records, not active migrations.

Install dependencies with `npm ci`. Copy `.env.example` to `.env` and set
`DATABASE_URL` and `DIRECT_URL` to the same local MySQL database. Then run:

```bash
npm run db:validate
npm run db:generate
npm run db:status
```

On Windows, stop running app processes before regenerating the client if Prisma
reports an `EPERM` error while replacing its native engine file.

For a new, empty local database, `npm run db:deploy` applies the committed MySQL
migrations. Existing production deployments use the restricted migration runner
described in [the deployment guide](deploy/cicd/README.md); keep the baseline and
applied migration files unchanged. Schema changes require a new forward migration.

Run `npm run typecheck`, `npm run test:unit`, and
`npm --prefix apps/aws-backend run typecheck` to check both applications.

Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
