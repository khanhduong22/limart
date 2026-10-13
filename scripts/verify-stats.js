
// Legacy test script
// const { getUserMonthlyStats } = require('../apps/api/src/lib/payroll-calculator');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('Verifying stats.ts...');
  
  // Get a test user (Khanh)
  const user = await prisma.user.findFirst({
    where: { email: 'khanhdev4@gmail.com' }
  });

  if (!user) {
    console.error('Test user not found');
    return;
  }

  console.log(`Testing with user: ${user.name} (${user.id})`);
  
  const targetDate = new Date(); // Current month
  console.log(`Target Date: ${targetDate.toISOString()}`);

  const start = Date.now();
  const stats = await getUserMonthlyStats(user.id, targetDate);
  const end = Date.now();

  console.log('--- STATS OUTPUT ---');
  console.log(`Total Hours: ${stats.totalHours}`);
  console.log(`Days Worked: ${stats.daysWorked}`);
  console.log(`Base Salary: ${stats.baseSalary}`);
  console.log(`Total Salary: ${stats.totalSalary}`);
  console.log(`Daily Details Count: ${stats.dailyDetails.length}`);
  console.log(`Execution Time: ${end - start}ms`);
  
  // console.log(JSON.stringify(stats, null, 2));
}

verify()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
