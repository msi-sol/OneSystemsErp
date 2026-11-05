import { prismaBase as prisma } from '../../src/lib/prisma-base';

const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Luis', 'Carmen', 'Carlos', 'Lourdes',
  'Eduardo', 'Teresita', 'Roberto', 'Luz', 'Manuel', 'Elena', 'Ricardo', 'Josephine', 'Antonio', 'Cristina',
  'Fernando', 'Marites', 'Ramon', 'Evelyn', 'Vicente', 'Jocelyn', 'Mario', 'Imelda', 'Francisco', 'Mary Grace',
  'Reynaldo', 'Gloria', 'Romeo', 'Corazon', 'Rolando', 'Celia', 'Edwin', 'Lilia', 'Renato', 'Leticia',
  'Danilo', 'Aurora', 'Arturo', 'Marilyn', 'Oscar', 'Rosario', 'Edgardo', 'Elvira', 'Ernesto', 'Estrella',
  'Jomar', 'Rica', 'Arnel', 'Nida', 'Boyet', 'Aileen', 'Jay', 'Melanie', 'Mark', 'Michelle'
];

const LAST_NAMES = [
  'Dela Cruz', 'Garcia', 'Reyes', 'Ramos', 'Mendoza', 'Santos', 'Flores', 'Gonzales', 'Bautista', 'Villanueva',
  'Fernandez', 'Cruz', 'De Leon', 'Aquino', 'Ocampo', 'Tolentino', 'Domingo', 'Gomez', 'Chua', 'Diaz',
  'Navarro', 'Castro', 'Torres', 'San Juan', 'Soriano', 'Roxas', 'Perez', 'Valdez', 'Cortez', 'Mercado',
  'Miranda', 'Javier', 'Salazar', 'Rivera', 'Santiago', 'David', 'Guzman', 'Velasco', 'Alvarez', 'Tan',
  'Aguilar', 'Pascual', 'Manalo', 'Serrano', 'Lopez', 'Martinez', 'Enriquez', 'Alonso', 'Vergara', 'Gutierrez'
];

const WORKER_CATEGORIES = ['ADMIN', 'SKILLED', 'LABORER', 'CONSULTANT'];
const EMPLOYMENT_TYPES = ['PROJECT_BASED', 'REGULAR', 'CONTRACTUAL'];
const DEPARTMENTS = ['ENGINEERING', 'OPERATIONS', 'FINANCE', 'HR', 'MAINTENANCE'];

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

export async function seedWorkers() {
  console.log('Seeding Workers...');
  
  const workers = [];
  
  for (let i = 1; i <= 55; i++) {
    const firstName = getRandomItem(FIRST_NAMES);
    const lastName = getRandomItem(LAST_NAMES);
    const workerCategory = getRandomItem(WORKER_CATEGORIES);
    
    let dailyRate = 0;
    let basicMonthlySalary = 0;
    
    if (workerCategory === 'ADMIN' || workerCategory === 'CONSULTANT') {
      basicMonthlySalary = getRandomInt(15000, 80000);
      dailyRate = basicMonthlySalary / 22;
    } else if (workerCategory === 'SKILLED') {
      dailyRate = getRandomInt(600, 1200);
    } else {
      dailyRate = getRandomInt(400, 600); // Laborer
    }

    const payrollMode = Math.random() > 0.5 ? 'CASH' : (Math.random() > 0.5 ? 'BANK' : 'GCASH');

    workers.push({
      workerId: `DEMO-WRK-${i.toString().padStart(3, '0')}`,
      firstName,
      lastName,
      employmentType: getRandomItem(EMPLOYMENT_TYPES),
      workerCategory,
      department: getRandomItem(DEPARTMENTS),
      dailyRate,
      basicMonthlySalary,
      hourlyRate: dailyRate / 8,
      payrollMode,
      bankName: payrollMode === 'BANK' ? getRandomItem(['BDO', 'BPI', 'Metrobank', 'UnionBank']) : null,
      bankAccountNumber: payrollMode === 'BANK' ? generateRandomNumber(10) : null,
      gcashNumber: payrollMode === 'GCASH' ? `09${generateRandomNumber(9)}` : null,
      tinNumber: `${generateRandomNumber(3)}-${generateRandomNumber(3)}-${generateRandomNumber(3)}-000`,
      sssNumber: `${generateRandomNumber(2)}-${generateRandomNumber(7)}-${generateRandomNumber(1)}`,
      philHealthNumber: `${generateRandomNumber(2)}-${generateRandomNumber(9)}-${generateRandomNumber(1)}`,
      validIdType: getRandomItem(['UMID', 'Passport', 'Driver License', 'National ID']),
      validIdNumber: generateRandomNumber(9),
      isSeedData: true,
      mobileNumber: `09${generateRandomNumber(9)}`,
      emailAddress: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@example.com`,
    });
  }

  const createdWorkers = await prisma.worker.createMany({
    data: workers,
  });

  console.log(`Created ${createdWorkers.count} seeded workers.`);
}

if (require.main === module) {
  seedWorkers()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
