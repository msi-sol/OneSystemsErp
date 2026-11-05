import { prismaBase as prisma } from '../../src/lib/prisma-base';

const SUPPLIER_NAMES = [
  'Atlas Construction Supplies', 'Metro Hardware', 'BuildRight Materials', 'Pioneer Concrete', 
  'Eagle Steel Corp', 'Pacific Lumber', 'Summit Aggregates', 'Global Paint Systems', 
  'City Lights Electrical', 'AquaFlow Plumbing', 'Solid Block Industries', 'Prime Tools Equipment',
  'Master Builders Depot', 'Dynamic Earthworks', 'Apex Roofing Solutions', 'Unity Cement',
  'Reliable Sand & Gravel', 'Evergreen Timber', 'Superior Glass Works', 'Nexus Cables'
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomNumber(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

export async function seedSuppliers() {
  console.log('Seeding Suppliers...');
  
  const suppliers = [];
  
  for (let i = 1; i <= 40; i++) {
    const baseName = SUPPLIER_NAMES[(i - 1) % SUPPLIER_NAMES.length];
    const name = i > SUPPLIER_NAMES.length ? `${baseName} Branch ${i}` : baseName;

    suppliers.push({
      name,
      tin: `${generateRandomNumber(3)}-${generateRandomNumber(3)}-${generateRandomNumber(3)}-000`,
      contactPerson: `Contact Person ${i}`,
      contactNumber: `09${generateRandomNumber(9)}`,
      email: `sales@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      address: `123 Demo St., Business Park ${i}, City`,
      paymentTerms: getRandomItem(['COD', '15 Days', '30 Days', '60 Days']),
      isVatable: Math.random() > 0.2, // 80% vatable
      isSeedData: true
    });
  }

  const createdSuppliers = await prisma.supplier.createMany({
    data: suppliers,
  });

  console.log(`Created ${createdSuppliers.count} seeded suppliers.`);
}

if (require.main === module) {
  seedSuppliers()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
