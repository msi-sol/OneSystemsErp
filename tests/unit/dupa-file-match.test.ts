import { matchPackage } from '@/lib/scheduling/dupa-file-match';

const packages = [
  { id: 'a', code: 'WP-01', name: 'Mobilization' },
  { id: 'b', code: 'WP-010', name: 'Air-conditioning VRV System A' },
];

describe('bulk DUPA file matching', () => {
  it('matches the package code as a whole token, with or without the dash', () => {
    expect(matchPackage('DUPA WP-01.xlsx', packages)).toBe('a');
    expect(matchPackage('dupa_wp01_final.xlsx', packages)).toBe('a');
    expect(matchPackage('WP-010 dupa.pdf', packages)).toBe('b');
  });

  it('falls back to the package name, else leaves it for the user to choose', () => {
    expect(matchPackage('Air-conditioning VRV System A - DUPA.docx', packages)).toBe('b');
    expect(matchPackage('random.xlsx', packages)).toBe('');
  });
});
