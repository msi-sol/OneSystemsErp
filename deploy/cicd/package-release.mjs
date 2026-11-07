// Run after `npm ci` and `npm run build`, before pruning any build dependencies.
import { cp, mkdir, readdir, stat, writeFile, readFile, access } from 'node:fs/promises';
import { resolve, relative, dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, isBuiltin } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const normalized = path => path.split(sep).join('/');

export function includeRuntimePath(path) {
  const parts = normalized(path).split('/');
  if (parts.some(part => part === '.git' || part === '.env' || part.startsWith('.env.'))) return false;
  // Only exclude mutable storage roots. `uploads` is also a legitimate API
  // route segment (including BOQ originals), whose compiled modules must ship.
  const runtimePath = normalized(path).replace(/^\.next\/standalone\//, '');
  if (/^(?:public\/)?uploads(?:\/|$)/.test(runtimePath) || parts.includes('.cache')) return false;
  if (normalized(path).includes('.next/cache')) return false;
  const name = parts.at(-1);
  // EC2 uses Debian/OpenSSL 3. Keep build-host engines in node_modules, but
  // never ship them alongside the explicit production engine.
  if (/^(?:libquery_engine-|query_engine-|schema-engine-)/.test(name) && !name.includes('debian-openssl-3.0.x')) return false;
  return true;
}

export async function verifyAppRoutes(stage) {
  const serverRoot = resolve(stage, '.next/server');
  const routes = JSON.parse(await readFile(join(serverRoot, 'app-paths-manifest.json'), 'utf8'));
  for (const [route, file] of Object.entries(routes)) {
    const target = resolve(serverRoot, file);
    if (!target.startsWith(serverRoot + sep)) throw new Error(`Invalid packaged app route: ${route}`);
    try { await access(target); }
    catch { throw new Error(`App route was not packaged: ${route} (${file})`); }
  }
  console.log(`Packaged app route modules verified: ${Object.keys(routes).length}`);
}

export function releaseManifest(env = process.env, node = process.version) {
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || !/^refs\/heads\/(?:main|master)$/.test(env.GITHUB_REF || '') || !/^\d+$/.test(env.GITHUB_RUN_ID || '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw new Error('Verified GitHub release metadata is required');
  return { format: 2, repositoryId: '1439613899', revision: env.GITHUB_SHA,
    ref: env.GITHUB_REF, runId: `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, node };
}

async function copyTree(source, target) {
  await cp(source, target, { recursive: true, dereference: true, filter: sourcePath => includeRuntimePath(relative(root, sourcePath)) });
}

async function bytesIn(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return info.size;
  const sizes = await Promise.all((await readdir(path)).map(name => bytesIn(join(path, name))));
  return sizes.reduce((sum, bytes) => sum + bytes, 0);
}

export async function smokeRuntimeLibraries(runtimeRequire) {
  const ExcelJS = runtimeRequire('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Runtime check').getCell('A1').value = 'Packaging verification';
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  if (xlsx.length < 4 || xlsx.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('Staged ExcelJS ZIP generation failed');
  let pdfEntry;
  try { pdfEntry = runtimeRequire.resolve('pdfkit'); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  if (pdfEntry) {
    const PDFDocument = runtimeRequire('pdfkit');
    const document = new PDFDocument({ size: 'A4' });
    const chunks = [];
    const completed = new Promise((resolvePdf, rejectPdf) => {
      document.on('data', chunk => chunks.push(chunk));
      document.once('error', rejectPdf);
      document.once('end', resolvePdf);
    });
    document.text('Packaging verification');
    document.end();
    await completed;
    const pdf = Buffer.concat(chunks);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Staged PDFKit font generation failed');
  }
  // Exercise PDF.js's native canvas and worker, even if PDFKit was bundled into
  // Next rather than traced as an external package. This minimal PDF has a real xref.
  const content = 'BT /F1 12 Tf 72 720 Td (Packaging verification) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const { PDFParse } = runtimeRequire('pdf-parse');
  const parser = new PDFParse({ data: Buffer.from(source), isEvalSupported: false });
  try {
    const text = await parser.getText();
    if (!text.text.includes('Packaging verification')) throw new Error('Staged PDF reader returned no source text');
  } finally { await parser.destroy(); }
  const image = await runtimeRequire('sharp')(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI8cAAAAASUVORK5CYII=', 'base64')).metadata();
  if (image.format !== 'png' || image.width !== 1 || image.height !== 1) throw new Error('Staged upload image decoder failed');
  console.log(`Runtime asset smoke checks passed: ExcelJS ZIP, PDF.js native canvas/worker/text, image decoder${pdfEntry ? ', PDFKit fonts/PDF' : ''}`);
}

export async function packageRelease(stagePath) {
  const stage = resolve(stagePath);
  // Never delete an existing tree. A fresh, empty stage also prevents stale
  // modules or credentials from silently surviving a previous package.
  if (stage === root || !relative(root, stage) || ['node_modules', '.next', 'public', 'src', 'prisma', 'apps', 'deploy'].includes(relative(root, stage).split(sep)[0])) throw new Error('Unsafe release staging path');
  await mkdir(stage, { recursive: true });
  if ((await readdir(stage)).length) throw new Error('Release stage must be empty');
  const manifest = releaseManifest();
  const [{ build }, { nodeFileTrace }] = await Promise.all([import('esbuild'), import('@vercel/nft')]);
  const standalone = join(root, '.next/standalone');
  await access(join(standalone, 'server.js'));
  await copyTree(standalone, stage);
  await copyTree(join(root, 'public'), join(stage, 'public'));
  await copyTree(join(root, '.next/static'), join(stage, '.next/static'));
  await verifyAppRoutes(stage);

  // Keep build output inside the tracing root, but outside the standalone tree.
  const buildDir = join(root, '.next/deployment-backend');
  await mkdir(buildDir, { recursive: true });
  const backend = join(buildDir, 'server.mjs');
  const compiled = await build({ entryPoints: [join(root, 'apps/aws-backend/src/index.ts')], outfile: backend,
    bundle: true, packages: 'external', platform: 'node', target: 'node22', format: 'esm',
    tsconfig: join(root, 'tsconfig.json'), sourcemap: false, metafile: true, logLevel: 'warning',
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; import { fileURLToPath as __fileURLToPath } from "node:url"; import { dirname as __pathDirname } from "node:path"; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);' },
  });
  const externalImports = [...new Set(Object.values(compiled.metafile.outputs).flatMap(output => output.imports.filter(item => item.external && !isBuiltin(item.path)).map(item => item.path)))];
  const sourceRequire = createRequire(join(root, 'package.json'));
  for (const name of externalImports) sourceRequire.resolve(name);
  const entries = [backend, ...externalImports.map(name => sourceRequire.resolve(name)), join(root, 'node_modules/prisma/build/index.js'),
    join(root, 'node_modules/@prisma/client/default.js'), join(root, 'node_modules/.prisma/client/index.js')];
  const traced = await nodeFileTrace(entries, { base: root, processCwd: root, fileIOConcurrency: 64 });
  for (const warning of traced.warnings) console.warn(`Runtime trace warning: ${warning.message}`);
  for (const file of traced.fileList) {
    if (!includeRuntimePath(file) || !normalized(file).startsWith('node_modules/')) continue;
    await mkdir(dirname(join(stage, file)), { recursive: true });
    await copyTree(join(root, file), join(stage, file));
  }
  await mkdir(join(stage, 'backend'), { recursive: true });
  await cp(backend, join(stage, 'backend/server.mjs'));

  // Native/wasm engines and data files are dynamic runtime assets; explicitly
  // include them rather than depending on a tracer's interpretation of globs.
  for (const path of ['node_modules/.prisma/client', 'node_modules/prisma/build', 'node_modules/@prisma/engines',
    'node_modules/pdfkit/js/data', 'node_modules/exceljs/lib', 'node_modules/xlsx',
    'node_modules/pdf-parse', 'node_modules/pdfjs-dist', 'node_modules/@napi-rs/canvas',
    'node_modules/@napi-rs/canvas-linux-x64-gnu',
    'node_modules/sharp', 'node_modules/@img/sharp-linux-x64', 'node_modules/@img/sharp-libvips-linux-x64',
    'prisma/schema.prisma', 'prisma/migrations', 'artifacts/scheduling', 'src/lib/scheduling/blueprints']) {
    await copyTree(join(root, path), join(stage, path));
  }
  for (const path of ['node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x',
    'node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node',
    'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node']) {
    await access(join(root, path));
    await mkdir(dirname(join(stage, path)), { recursive: true });
    await cp(join(root, path), join(stage, path));
  }
  await writeFile(join(stage, 'deployment-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const stagedRequire = createRequire(join(stage, 'package.json'));
  const checkedRequire = name => { checkedRequire.resolve(name); return stagedRequire(name); };
  checkedRequire.resolve = name => {
    const path = stagedRequire.resolve(name);
    if (relative(stage, path).startsWith('..') || !path.startsWith(stage + sep)) {
      const error = new Error(`Runtime module was not packaged: ${name}`);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }
    return path;
  };
  for (const name of externalImports) checkedRequire.resolve(name);
  await smokeRuntimeLibraries(checkedRequire);
  // The CLI requires its own query engine as well as the generated client's
  // engine. Verify both explicit production engines without database access.
  const cliCheck = spawnSync(process.execPath, [join(stage, 'node_modules/prisma/build/index.js'), '--version'], {
    cwd: stage, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, PRISMA_CLI_BINARY_TARGETS: 'debian-openssl-3.0.x',
      PRISMA_QUERY_ENGINE_LIBRARY: join(stage, 'node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node'),
      PRISMA_SCHEMA_ENGINE_BINARY: join(stage, 'node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x') },
  });
  if (cliCheck.status !== 0) throw new Error('Packaged Prisma CLI and production engines failed the offline version check');
  console.log('Packaged Prisma CLI and production engine version checks passed');
  for (const path of ['server.js', 'backend/server.mjs', '.next/BUILD_ID',
    'node_modules/prisma/build/index.js', 'node_modules/@prisma/client/package.json',
    'node_modules/pdfkit/js/data/Helvetica.afm', 'public/templates/Final_BOQ_Bid_Detailed_Cost_Breakdown_Template.xlsx']) await access(join(stage, path));
  const bytes = await bytesIn(stage);
  console.log(`Release format 2: ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(1)} MiB) before compression`);
  return { ...manifest, bytes };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('Usage: node deploy/cicd/package-release.mjs <empty-stage-path>');
  await packageRelease(process.argv[2]);
}
