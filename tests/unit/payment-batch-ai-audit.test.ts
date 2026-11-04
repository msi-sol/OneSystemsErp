jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({
  prisma: { paymentBatch: { findUnique: jest.fn(), update: jest.fn() } },
}));

import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import router from '../../apps/aws-backend/src/routes/aiPaymentValidationActions';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import BatchDetailClient from '../../src/app/finance/payment-batches/[id]/BatchDetailClient';

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/aiPaymentValidationActions', router);
  server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/aiPaymentValidationActions`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.paymentBatch.update as jest.Mock).mockResolvedValue({});
});

function worker(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `worker-${index}`,
    firstName: 'Worker',
    lastName: String(index),
    employmentStatus: 'ACTIVE',
    allowedPaymentMethod: 'GCash Only',
    paymentProfileStatus: 'Verified',
    gcashVerificationStatus: 'Verified',
    gcashAccountName: `Worker ${index}`,
    gcashNumber: `0917000000${index}`,
    bankVerificationStatus: 'Pending',
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    ...overrides,
  };
}

function gcashBatch(workers: Array<ReturnType<typeof worker>>) {
  return {
    id: 'batch-1',
    batchNumber: 'BAT-GCASH-2026-0001',
    paymentMethodType: 'GCASH',
    rows: workers.map((rowWorker, index) => ({
      id: `row-${index}`,
      payrollId: `payroll-${index}`,
      amount: 5000,
      status: 'PENDING',
      worker: rowWorker,
    })),
  };
}

// Runs the audit, then renders the batch page's export button from what the audit saved.
async function audit(batch: ReturnType<typeof gcashBatch>) {
  (prisma.paymentBatch.findUnique as jest.Mock).mockResolvedValue(batch);
  const response = await fetch(`${origin}/validatePaymentBatchWithAI`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId: batch.id }),
  });
  const body = await response.json();
  const saved = (prisma.paymentBatch.update as jest.Mock).mock.calls[0][0].data;
  const page = renderToStaticMarkup(createElement(BatchDetailClient, { batch: { ...batch, ...saved } }));
  const exportButton = page.match(/<button[^>]*>/)?.[0] ?? '';
  return { response, body, saved, exportDisabled: /\sdisabled(=|\s|>)/.test(exportButton) };
}

describe('payment batch AI audit', () => {
  it('rates a fully verified, active batch LOW and allows export', async () => {
    const { response, body, saved, exportDisabled } = await audit(gcashBatch([worker(1), worker(2), worker(3), worker(4)]));

    expect(response.status).toBe(200);
    expect(body.riskLevel).toBe('LOW');
    expect(saved.aiRiskLevel).toBe('LOW');
    expect(body.anomalies).toEqual(['No anomalies detected. All profiles are verified and details match routing rules.']);
    expect(exportDisabled).toBe(false);
  });

  it.each(['INACTIVE', 'SUSPENDED'])('blocks export when one worker is %s, naming the actual status', async (employmentStatus) => {
    const { body, saved, exportDisabled } = await audit(gcashBatch([worker(1), worker(2, { employmentStatus })]));

    expect(body.riskLevel).toBe('BLOCKED');
    expect(saved.aiRiskLevel).toBe('BLOCKED');
    expect(body.anomalies).toEqual([`Worker Worker 2 is ${employmentStatus} but included in the batch.`]);
    expect(exportDisabled).toBe(true);
  });

  it('still rates an unverified but active worker HIGH rather than BLOCKED', async () => {
    const { body } = await audit(gcashBatch([worker(1, { gcashVerificationStatus: 'Pending' })]));

    expect(body.riskLevel).toBe('HIGH');
  });

  it('builds its fixture from fields the Worker model really has', () => {
    const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
    const start = schema.indexOf('model Worker {');
    const fields = schema.slice(start, schema.indexOf('\n}', start)).split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)[0]);

    expect(fields).not.toContain('status');
    expect(fields).toEqual(expect.arrayContaining(Object.keys(worker(1))));
  });
});
