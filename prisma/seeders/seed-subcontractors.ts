import { BusinessType, AccreditationStatus } from '@prisma/client';
import { prismaBase as prisma } from '../../src/lib/prisma-base';

const SUBCONTRACTOR_NAMES = [
  'Alpha Build Subcontractors', 'Omega Trade Services', 'Structural Masters', 'Precision Layouts',
  'EcoGreen Installations', 'Solid Formworks', 'Rapid Steel Installers', 'Prime Finishing Corp',
  'Elite Glass and Aluminum', 'Pro Welders Union', 'Dynamic Concrete Works', 'Vanguard Paving',
  'Secure Fencing Solutions', 'Bright Sparks Electrical', 'Clear Flow Plumbing', 'Cool Air HVAC',
  'Master Tile Setters', 'Perfect Paint Contractors', 'Durable Roofing Systems', 'Safe Scaffolding'
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomNumber(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

export async function seedSubcontractors() {
  console.log('Seeding Subcontractors & Job Order Contractors...');
  
  const subcontractors = [];
  
  // 1. Standard Subcontractors (25 total)
  for (let i = 1; i <= 25; i++) {
    const baseName = SUBCONTRACTOR_NAMES[(i - 1) % SUBCONTRACTOR_NAMES.length];
    const name = i > SUBCONTRACTOR_NAMES.length ? `${baseName} V2` : baseName;

    subcontractors.push({
      name,
      businessName: `${name} Inc.`,
      businessType: getRandomItem([BusinessType.CORPORATION, BusinessType.PARTNERSHIP]),
      contractType: 'SUBCONTRACTOR',
      address: `456 Demo Avenue, Subcon Zone ${i}, City`,
      contactPerson: `Engr. Subcon ${i}`,
      contactNumber: `09${generateRandomNumber(9)}`,
      email: `admin@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      tin: `${generateRandomNumber(3)}-${generateRandomNumber(3)}-${generateRandomNumber(3)}-000`,
      birReg: `BIR-${generateRandomNumber(6)}`,
      pcabLicense: `PCAB-${generateRandomNumber(5)}`,
      accreditation: AccreditationStatus.APPROVED,
      isSeedData: true,
      requiredDocs: JSON.parse('{"businessPermit": true, "pcab": true, "bir": true}')
    });
  }

  // 2. Job Order Contractors (10 total)
  for (let i = 1; i <= 10; i++) {
    const name = `JOC Master ${i} Services`;

    subcontractors.push({
      name,
      businessName: name,
      businessType: BusinessType.INDIVIDUAL_CONTRACTOR,
      contractType: 'JOB_ORDER',
      address: `789 JOC St., Ward ${i}, City`,
      contactPerson: `Foreman ${i}`,
      contactNumber: `09${generateRandomNumber(9)}`,
      email: `joc${i}@demo.com`,
      tin: `${generateRandomNumber(3)}-${generateRandomNumber(3)}-${generateRandomNumber(3)}-000`,
      accreditation: AccreditationStatus.APPROVED,
      isSeedData: true,
      requiredDocs: JSON.parse('{"validId": true, "barangayClearance": true}')
    });
  }

  const createdSubcontractors = await prisma.subcontractor.createMany({
    data: subcontractors,
  });

  console.log(`Created ${createdSubcontractors.count} seeded subcontractors and JOCs.`);
}

if (require.main === module) {
  seedSubcontractors()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
