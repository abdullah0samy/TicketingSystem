import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ticketCount = parseInt(process.argv[2] || '10000', 10);
  const batchSize = 500;

  const users = await prisma.user.findMany({ where: { isActive: true } });
  const departments = await prisma.department.findMany();
  const buildings = await prisma.building.findMany({ include: { floors: true } });
  const ticketTypes = await prisma.ticketType.findMany();

  if (users.length === 0 || departments.length === 0) {
    console.error('Run `npx prisma db seed` first to create baseline data');
    process.exit(1);
  }

  console.log(`Found ${users.length} users, ${departments.length} depts, ${buildings.length} buildings, ${ticketTypes.length} ticket types`);

  const existing = await prisma.ticket.count();
  console.log(`Existing tickets: ${existing}`);

  const statuses = ['pending', 'open', 'in_progress', 'resolved', 'closed'];
  const priorities = ['low', 'normal', 'high', 'urgent'];
  const subjects = [
    'Network connection issue', 'Printer not working', 'Software installation request',
    'AC leaking in room', 'Light bulb replacement', 'Broken chair',
    'Access card not working', 'New employee onboarding', 'Payroll inquiry',
    'Medical device calibration', 'System slow performance', 'Email not syncing',
    'Phone line issue', 'Water leak in bathroom', 'Door lock broken',
    'Projector not working', 'Internet down', 'Server access issue',
  ];

  const startTime = Date.now();

  for (let batch = 0; batch < ticketCount; batch += batchSize) {
    const currentBatch = Math.min(batchSize, ticketCount - batch);
    const tickets: any[] = [];
    const auditLogs: any[] = [];

    for (let i = 0; i < currentBatch; i++) {
      const idx = batch + i;
      const creator = users[Math.floor(Math.random() * users.length)];
      const targetDept = departments[Math.floor(Math.random() * departments.length)];
      const building = buildings[Math.floor(Math.random() * buildings.length)];
      const floor = building.floors.length > 0 ? building.floors[Math.floor(Math.random() * building.floors.length)] : null;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      const deptTicketTypes = ticketTypes.filter(tt => tt.departmentId === targetDept.id || !tt.departmentId);
      const ticketType = deptTicketTypes.length > 0 ? deptTicketTypes[Math.floor(Math.random() * deptTicketTypes.length)] : null;

      const createdAt = new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000));

      const slaHours = ticketType?.slaHours || targetDept.slaHours || 24;
      const slaDeadline = new Date(createdAt);
      slaDeadline.setHours(slaDeadline.getHours() + slaHours);

      let completedAt: Date | null = null;
      let closedAt: Date | null = null;
      if (status === 'resolved' || status === 'closed') {
        completedAt = new Date(createdAt);
        completedAt.setHours(completedAt.getHours() + Math.floor(Math.random() * slaHours));
        if (status === 'closed') {
          closedAt = new Date(completedAt);
          closedAt.setHours(closedAt.getHours() + 2);
        }
      }

      const deptAgents = users.filter(u => u.departmentId === targetDept.id && (u.role === 'agent' || u.role === 'supervisor'));
      const assignedTo = (status !== 'pending' && status !== 'open' && deptAgents.length > 0)
        ? deptAgents[Math.floor(Math.random() * deptAgents.length)]
        : null;

      tickets.push({
        ticketNumber: `LOAD-${createdAt.toISOString().slice(2, 10).replace(/-/g, '')}-${(existing + idx + 1).toString().padStart(6, '0')}`,
        subject: subjects[idx % subjects.length],
        description: `Load test ticket #${existing + idx + 1}. ${subjects[idx % subjects.length]}.`,
        createdById: creator.id,
        creatorName: creator.fullNameEn || creator.fullNameAr,
        creatorDeptId: creator.departmentId,
        departmentId: targetDept.id,
        buildingId: building.id,
        buildingName: building.nameEn,
        floorId: floor?.id || null,
        floorName: floor?.nameEn || null,
        status,
        priority,
        ticketTypeId: ticketType?.id || null,
        assignedToId: assignedTo?.id || null,
        createdAt,
        slaDeadline,
        completedAt,
        closedAt,
        rating: status === 'closed' ? Math.floor(Math.random() * 3) + 3 : null,
        feedback: status === 'closed' && Math.random() > 0.5 ? 'Good service' : null,
      });

      auditLogs.push({
        ticketId: 0,
        userId: creator.id,
        action: 'TICKET_CREATED',
        departmentId: targetDept.id,
        createdAt,
      });
    }

    await prisma.ticket.createMany({ data: tickets, skipDuplicates: true });

    const created = await prisma.ticket.findMany({
      where: { ticketNumber: { in: tickets.map(t => t.ticketNumber) } },
      select: { id: true, ticketNumber: true, createdAt: true },
    });
    const ticketMap = new Map(created.map(t => [t.ticketNumber, t.id]));

    const logs = auditLogs.map((log, i) => ({
      ...log,
      ticketId: ticketMap.get(tickets[i].ticketNumber) || 0,
      createdAt: tickets[i].createdAt,
    })).filter(l => l.ticketId > 0);

    for (let j = 0; j < logs.length; j += batchSize) {
      await prisma.auditLog.createMany({
        data: logs.slice(j, j + batchSize),
        skipDuplicates: true,
      });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Batch ${Math.floor(batch / batchSize) + 1}: ${batch + currentBatch}/${ticketCount} tickets (${elapsed}s)`);
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const finalCount = await prisma.ticket.count();
  console.log(`\nDone! Created ${finalCount - existing} new tickets in ${totalElapsed}s`);
  console.log(`Total tickets in DB: ${finalCount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
