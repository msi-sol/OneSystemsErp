jest.mock('../../apps/aws-backend/src/lib/wps-material-return', () => ({
  processWpsMaterialReturn: jest.fn(),
}));

import router from '../../apps/aws-backend/src/routes/returnActions';
import { processWpsMaterialReturn } from '../../apps/aws-backend/src/lib/wps-material-return';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const processReturn = (router as unknown as { stack: { route?: { path: string; stack: { handle: Handler }[] } }[] }).stack
  .find(row => row.route?.path === '/processMaterialReturn')!.route!.stack[0].handle;

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('material return processing actor attribution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (processWpsMaterialReturn as jest.Mock).mockResolvedValue({ id: 'return-a' });
  });

  it('uses the authenticated actor and ignores a forged warehouseman ID', async () => {
    const res = response();
    await processReturn({
      headers: { 'x-user-session': 'warehouseman-real' },
      body: { returnId: 'return-a', warehousemanId: 'forged-warehouseman' },
    }, res);

    expect(processWpsMaterialReturn).toHaveBeenCalledWith('return-a', 'warehouseman-real');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'return-a' } });
  });

  it('rejects a missing authenticated actor before processing', async () => {
    const res = response();
    await processReturn({ headers: {}, body: { returnId: 'return-a', warehousemanId: 'forged-warehouseman' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(processWpsMaterialReturn).not.toHaveBeenCalled();
  });
});
