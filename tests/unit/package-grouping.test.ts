import { groupSectionsIntoPackages, isMajorHeading } from '@/lib/scheduling/package-grouping';

const s = (order: number, name: string, items: string[] = [name]) => ({ order, name, items });

// The 70 sections exactly as imported from the PGH VRF awarded BOQ (pgh_files/PGH_AWARDED BILL OF QUANTITY.xlsx).
const vrvSystem = (start: number, head: string, accessories: string) => [
  s(start, head), s(start + 1, accessories), s(start + 2, 'Copper Pipes - Type L Hard Drawn Pipes'), s(start + 3, 'Copper Pipes Insulation 25mm Thick'),
  s(start + 4, 'Condensate Drain Pipes'), s(start + 5, 'Condensate Drain Pipes Rubber Insulation 1.5 meters'), s(start + 6, 'Drain Pump'),
  s(start + 7, 'Fittings'), s(start + 9, 'Rough-ins'), s(start + 10, 'Cables / Wires'), s(start + 11, 'for ground:'),
];
const pghSections = [
  s(4, 'INSURANCES AND BONDS'), s(5, 'Site Management Work'), s(6, 'Temporary Works'), s(8, 'Security, Safety and Protection'),
  s(9, 'Quality Standard and Control'), s(10, 'Transportation'),
  ...vrvSystem(13, 'I-A. AIR CONDITIONING- VRV SYSTEM A', 'ACU Accessories:'), s(25, 'I-B. CONSUMABLES'),
  ...vrvSystem(26, 'II.A AIR CONDITIONING- VRV SYSTEM B', 'Accessories:'), s(38, 'CONSUMABLES'),
  ...vrvSystem(39, 'III.A AIR CONDITIONING- VRV SYSTEM C', 'Accessories:'), s(51, 'CONSUMABLES'),
  ...vrvSystem(52, 'AIR CONDITIONING- VRV SYSTEM D', 'Accessories:'), s(64, 'CONSUMABLES'),
  s(68, 'Feeder Wire'), s(69, 'for ground:'), s(70, 'Roughing-ins'),
  s(71, 'III. Panel Board & Pullbox'), s(74, '4 - 125AT, 3P'), s(78, '9 - 30AT, 2P'), s(82, '11 - 30AT, 2P'), s(86, '5 - 30AT, 2P'),
  s(90, '8 - 30AT, 2P'), s(92, 'Branches: 4 - 150AT, 3P'), s(93, 'Transformer 500KVA Step Down Dry Type Transformer'), s(95, "ECB's"),
  s(96, 'Roughing-ins'), s(97, 'Roughing-ins Boxes'), s(98, 'Wires'), s(99, 'for ground:'),
];

describe('work package suggestion grouping', () => {
  it('groups sub-sections under their major heading instead of one package per section', () => {
    const groups = groupSectionsIntoPackages(pghSections);
    expect(pghSections).toHaveLength(70);
    expect(groups.map((group) => group.sections[0])).toEqual([
      'INSURANCES AND BONDS', 'I-A. AIR CONDITIONING- VRV SYSTEM A', 'I-B. CONSUMABLES', 'II.A AIR CONDITIONING- VRV SYSTEM B',
      'CONSUMABLES', 'III.A AIR CONDITIONING- VRV SYSTEM C', 'CONSUMABLES', 'AIR CONDITIONING- VRV SYSTEM D', 'CONSUMABLES',
      'Feeder Wire', 'III. Panel Board & Pullbox',
    ]);
    expect(groups[1].sections).toHaveLength(11);
    expect(groups[1].name).toBe('I-A. AIR CONDITIONING- VRV SYSTEM A + 10 related sections');
    expect(groups[10].sections).toEqual(['III. Panel Board & Pullbox', '4 - 125AT, 3P', '9 - 30AT, 2P', '11 - 30AT, 2P', '5 - 30AT, 2P', '8 - 30AT, 2P',
      'Branches: 4 - 150AT, 3P', 'Transformer 500KVA Step Down Dry Type Transformer', "ECB's", 'Roughing-ins', 'Roughing-ins Boxes', 'Wires', 'for ground:']);
  });

  it('keeps every item exactly once', () => {
    const groups = groupSectionsIntoPackages(pghSections);
    expect(groups.flatMap((group) => group.items)).toHaveLength(pghSections.length);
  });

  it('falls back to one package per section when no headings are recognisable', () => {
    const plain = [s(1, 'Earthworks'), s(2, 'Concrete works'), s(3, 'Masonry'), s(4, 'Finishes')];
    expect(groupSectionsIntoPackages(plain).map((group) => group.name)).toEqual(['Earthworks', 'Concrete works', 'Masonry', 'Finishes']);
  });

  it('leaves small BOQs as one package per section', () => {
    expect(groupSectionsIntoPackages([s(1, 'PART A'), s(2, 'Item 1'), s(3, 'Item 2')])).toHaveLength(3);
  });

  it('never starts a package at a sub-heading or rating row', () => {
    expect(isMajorHeading('ACU Accessories:', 14, 13)).toBe(false);
    expect(isMajorHeading('4 - 125AT, 3P', 74, 71)).toBe(false);
    expect(isMajorHeading('for ground:', 69, 60)).toBe(false);
    expect(isMajorHeading('III. Panel Board & Pullbox', 71, 70)).toBe(true);
  });
});
