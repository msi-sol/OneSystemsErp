import { readItemPercentages } from '@/lib/subcontracting/progress-report-percent';

describe('subcontractor progress report percentages', () => {
  const items = [
    { id: 'safety', description: 'a. Safety Officer' },
    { id: 'ppe', description: "b. Personal Protective Equipment (PPE's)" },
    { id: 'mob', description: 'Mobilization and Demobilization' },
  ];

  it('reads the percentage on or just below the line naming each item', () => {
    const report = [
      'Item: Security, Safety and Protection - a. Safety Officer',
      'Contract quantity: 1 lot',
      'Accomplished this period: 0.5 lot (50%)',
      "b. Personal Protective Equipment (PPE's) - 12.5% delivered",
    ].join('\n');
    expect(readItemPercentages(report, items)).toEqual({ safety: 50, ppe: 12.5, mob: null });
  });

  it('does not take the next item\'s percentage for an item without one', () => {
    const report = "a. Safety Officer: deployed\nb. Personal Protective Equipment (PPE's): 30%";
    expect(readItemPercentages(report, items)).toMatchObject({ safety: null, ppe: 30 });
  });

  it('caps values at 100%', () => {
    expect(readItemPercentages('Mobilization and Demobilization 150%', items).mob).toBe(100);
  });
});
