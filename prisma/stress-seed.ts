import { PrismaClient, Prisma } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Initiating Stress-Test Database Seeding (Phase 1)...');
  const start = Date.now();

  const passwordHash = await bcrypt.hash('Stress@123', 10);

  // 1. Fetch existing core data
  const roles = await prisma.role.findMany();
  const departments = await prisma.department.findMany({ where: { isActive: true } });
  const ticketTypes = await prisma.ticketType.findMany({ where: { isActive: true } });
  const buildings = await prisma.building.findMany({ include: { floors: true } });

  if (departments.length === 0 || buildings.length === 0) {
    throw new Error('Base data missing. Please run standard seed first.');
  }

  // 2. Generate 2,500 Users
  console.log('👥 Generating 2,500 users...');
  const usersToCreate: Prisma.UserCreateManyInput[] = [];
  for (let i = 0; i < 2500; i++) {
    const badge = (50000 + i).toString();
    usersToCreate.push({
      badgeNumber: badge,
      username: badge,
      passwordHash,
      fullNameEn: faker.person.fullName(),
      fullNameAr: `مستخدم ${i}`,
      role: i % 10 === 0 ? 'agent' : (i % 50 === 0 ? 'supervisor' : 'end_user'),
      departmentId: departments[i % departments.length].id,
      isActive: true,
      createdAt: faker.date.past({ years: 1 })
    });
  }
  await prisma.user.createMany({ data: usersToCreate, skipDuplicates: true });
  const allUsers = await prisma.user.findMany({ where: { badgeNumber: { startsWith: '50' } }, select: { id: true, departmentId: true, role: true } });
  console.log(`✅ ${allUsers.length} users created.`);

  // 3. Generate 15,000 Tickets
  console.log('🎫 Generating 15,000 tickets with historical distribution...');
  const ticketsToCreate: Prisma.TicketCreateManyInput[] = [];
  const statuses = ['pending', 'open', 'in_progress', 'resolved', 'closed'];
  const priorities = ['low', 'normal', 'high', 'urgent'];

  for (let i = 0; i < 15000; i++) {
    const creator = allUsers[faker.number.int({ min: 0, max: allUsers.length - 1 })];
    const dept = departments[faker.number.int({ min: 0, max: departments.length - 1 })];
    const building = buildings[i % buildings.length];
    const floor = building.floors[faker.number.int({ min: 0, max: building.floors.length - 1 })];
    const ticketType = ticketTypes.find(tt => tt.departmentId === dept.id) || ticketTypes[0];
    
    const createdAt = faker.date.past({ years: 1 });
    const status = i < 2000 ? statuses[faker.number.int({ min: 0, max: 2 })] : statuses[faker.number.int({ min: 3, max: 4 })];
    
    ticketsToCreate.push({
      ticketNumber: `STRESS-${i.toString().padStart(6, '0')}`,
      subject: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      createdById: creator.id,
      creatorName: `Stress User ${creator.id}`,
      departmentId: dept.id,
      buildingId: building.id,
      floorId: floor.id,
      ticketTypeId: ticketType.id,
      status: status,
      priority: priorities[i % 4],
      createdAt: createdAt,
      updatedAt: faker.date.recent({ days: 10, refDate: createdAt }),
      completedAt: (status === 'resolved' || status === 'closed') ? faker.date.future({ years: 0.1, refDate: createdAt }) : null,
      isArchived: status === 'closed' && faker.datatype.boolean(0.5)
    });

    if (i % 1000 === 0) console.log(`   Preparing ticket ${i}...`);
  }

  // Batch insert tickets
  const ticketChunks = chunkArray(ticketsToCreate, 1000);
  for (const chunk of ticketChunks) {
    await prisma.ticket.createMany({ data: chunk });
  }
  console.log('✅ 15,000 tickets inserted.');

  const allInsertedTickets = await prisma.ticket.findMany({ 
    where: { ticketNumber: { startsWith: 'STRESS' } }, 
    select: { id: true, departmentId: true, createdById: true } 
  });

  // 4. Generate 50,000 Audit Logs
  console.log('📋 Generating 50,000 audit logs...');
  const logsToCreate: Prisma.AuditLogCreateManyInput[] = [];
  const actions = ['TICKET_CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'TRANSFERRED', 'COMMENT_ADDED'];
  
  for (let i = 0; i < 50000; i++) {
    const ticket = allInsertedTickets[faker.number.int({ min: 0, max: allInsertedTickets.length - 1 })];
    const user = allUsers[faker.number.int({ min: 0, max: allUsers.length - 1 })];
    
    logsToCreate.push({
      ticketId: ticket.id,
      userId: user.id,
      action: actions[i % actions.length],
      departmentId: ticket.departmentId,
      createdAt: faker.date.recent({ days: 30 }),
      newData: { sample: 'Performance test data', idx: i },
      oldData: { sample: 'Previous state mock' }
    });
  }
  const logChunks = chunkArray(logsToCreate, 2000);
  for (const chunk of logChunks) {
    await prisma.auditLog.createMany({ data: chunk });
  }
  console.log('✅ 50,000 audit logs inserted.');

  // 5. Generate 50,000 Notifications
  console.log('🔔 Generating 50,000 notifications...');
  const notifsToCreate: Prisma.NotificationCreateManyInput[] = [];
  for (let i = 0; i < 50000; i++) {
    const user = allUsers[faker.number.int({ min: 0, max: allUsers.length - 1 })];
    const ticket = allInsertedTickets[faker.number.int({ min: 0, max: allInsertedTickets.length - 1 })];
    
    notifsToCreate.push({
      userId: user.id,
      ticketId: ticket.id,
      eventType: 'STRESS_TEST',
      titleEn: 'Performance Test Update',
      titleAr: 'تحديث اختبار الأداء',
      bodyEn: faker.lorem.sentence(),
      bodyAr: 'هذا مجرد اختبار لأداء النظام تحت الضغط العالي',
      isRead: faker.datatype.boolean(),
      createdAt: faker.date.recent({ days: 15 })
    });
  }
  const notifChunks = chunkArray(notifsToCreate, 2000);
  for (const chunk of notifChunks) {
    await prisma.notification.createMany({ data: chunk });
  }
  console.log('✅ 50,000 notifications inserted.');

  const end = Date.now();
  console.log(`\n🏆 Phase 1 Seeding Complete in ${((end - start) / 1000).toFixed(2)}s`);
  console.log('----------------------------------------------------');
  console.log(`Total Tickets: ${await prisma.ticket.count()}`);
  console.log(`Total Users: ${await prisma.user.count()}`);
  console.log(`Total Audit Logs: ${await prisma.auditLog.count()}`);
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
