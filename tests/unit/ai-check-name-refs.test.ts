jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('openai/helpers/zod', () => ({ zodTextFormat: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/scheduling/work-package-planning', () => ({ boqSections: jest.fn(), draftPackagesClearBlocker: jest.fn() }));

import { nameRefs } from '@/lib/ai/planning-ai-check';

const lines = ['1 · Ready-mix concrete', '2 · Rebar', '3 · Plywood', '4 · THHN wire 3.5 mm2'];
const boq = ['B.1 · Structural concrete', 'C.1 · THHN wire'];
const name = (text: string) => nameRefs(text, (ref) => lines[ref], (ref) => boq[ref]);

describe('AI check text: internal reference numbers become readable labels', () => {
  it('replaces line refs with the label people see', () => {
    expect(name('Exact duplicate of benchmark line ref 3.')).toBe('Exact duplicate of 4 · THHN wire 3.5 mm2.');
    expect(name('Same as ref 0 and refs 1')).toBe('Same as 1 · Ready-mix concrete and 2 · Rebar');
    expect(name('see ref #2')).toBe('see 3 · Plywood');
  });

  it('uses BOQ labels for BOQ refs', () => {
    expect(name('Covered by BOQ item ref 1.')).toBe('Covered by BOQ C.1 · THHN wire.');
  });

  it('leaves unknown refs and ordinary text alone', () => {
    expect(name('Row ref 99 is missing.')).toBe('Row ref 99 is missing.');
    expect(name('Use referenced standards, 12 refs total.')).toBe('Use referenced standards, 12 refs total.');
  });
});
