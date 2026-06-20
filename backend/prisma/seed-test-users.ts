import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test users...');

  const hash = await bcrypt.hash('Test@123', 12);

  const perms = await prisma.permission.createMany({
    data: [
      { name: 'view_analytics', description: 'View analytics' },
      { name: 'manage_departments', description: 'Manage departments' },
      { name: 'manage_users', description: 'Manage users' },
      { name: 'assign_tickets', description: 'Assign tickets' },
      { name: 'manage_ticket_types', description: 'Manage ticket types' },
      { name: 'manage_buildings', description: 'Manage buildings' },
      { name: 'view_all_tickets', description: 'View all tickets' },
    ],
    skipDuplicates: true,
  });

  const allPerms = await prisma.permission.findMany();

  const roles = {
    superAdmin: await prisma.role.upsert({
      where: { id: 1 }, create: { name: 'Super Admin', description: 'Full access', permissions: { connect: allPerms.map(p => ({ id: p.id })) } },
      update: {},
    }),
    agent: await prisma.role.upsert({
      where: { id: 2 }, create: { name: 'Agent', description: 'Can handle tickets', permissions: { connect: allPerms.filter(p => ['view_analytics', 'assign_tickets', 'view_all_tickets'].includes(p.name)).map(p => ({ id: p.id })) } },
      update: {},
    }),
    endUser: await prisma.role.upsert({
      where: { id: 3 }, create: { name: 'End User', description: 'Can submit tickets', permissions: { connect: [] } },
      update: {},
    }),
  };

  const deptPerms = await prisma.deptPermissions.createMany({
    data: [
      { canReceiveTickets: true, canSendTickets: true, canViewAllDeptTickets: true, canAssignTickets: true, canChangeStatus: true, canTransferTickets: true, canArchiveTickets: true },
      { canReceiveTickets: true, canSendTickets: false, canViewAllDeptTickets: true, canAssignTickets: true, canChangeStatus: true, canTransferTickets: false, canArchiveTickets: true },
      { canReceiveTickets: false, canSendTickets: true, canViewAllDeptTickets: false, canAssignTickets: false, canChangeStatus: false, canTransferTickets: false, canArchiveTickets: false },
    ],
    skipDuplicates: true,
  });

  const allDeptPerms = await prisma.deptPermissions.findMany();

  const itDept = await prisma.department.upsert({
    where: { id: 1 },
    create: { nameAr: 'تقنية المعلومات', nameEn: 'Information Technology', deptType: 'BOTH', defaultPermissionsId: allDeptPerms[0].id, slaHours: 4 },
    update: {},
  });

  const maintenanceDept = await prisma.department.upsert({
    where: { id: 2 },
    create: { nameAr: 'الصيانة الهندسية', nameEn: 'Engineering Maintenance', deptType: 'RECEIVER_ONLY', defaultPermissionsId: allDeptPerms[1].id, slaHours: 24 },
    update: {},
  });

  const financeDept = await prisma.department.upsert({
    where: { id: 4 },
    create: { nameAr: 'الشؤون المالية', nameEn: 'Finance', deptType: 'SENDER_ONLY', defaultPermissionsId: allDeptPerms[2].id, slaHours: 24 },
    update: {},
  });

  const ticketTypes = ['مشكلة تقنية', 'طلب صيانة', 'استفسار عام', 'طلب صلاحية'];
  const ticketTypesEn = ['Technical Issue', 'Maintenance Request', 'General Inquiry', 'Access Request'];
  const colors = ['#3B82F6', '#EF4444', '#10B981', '#8B5CF6'];

  for (let i = 0; i < ticketTypes.length; i++) {
    await prisma.ticketType.upsert({
      where: { id: i + 1 },
      create: { nameAr: ticketTypes[i], nameEn: ticketTypesEn[i], color: colors[i], departmentId: itDept.id, slaHours: 8 },
      update: {},
    });
    await prisma.ticketType.upsert({
      where: { id: i + 1 + ticketTypes.length },
      create: { nameAr: ticketTypes[i], nameEn: ticketTypesEn[i], color: colors[i], departmentId: maintenanceDept.id, slaHours: 24 },
      update: {},
    });
  }

  // Super Admin
  await prisma.user.upsert({
    where: { id: 1 },
    create: { badgeNumber: '00001', username: 'admin', passwordHash: hash, fullNameAr: 'مدير النظام', fullNameEn: 'System Admin', role: 'super_admin', roleId: roles.superAdmin.id },
    update: {},
  });

  // Agent in IT dept
  await prisma.user.upsert({
    where: { id: 2 },
    create: { badgeNumber: '10001', username: 'agent', passwordHash: hash, fullNameAr: 'أحمد الموظف', fullNameEn: 'Ahmed Agent', role: 'agent', roleId: roles.agent.id, departmentId: itDept.id },
    update: {},
  });

  // Agent in Maintenance dept
  await prisma.user.upsert({
    where: { id: 3 },
    create: { badgeNumber: '10002', username: 'agent2', passwordHash: hash, fullNameAr: 'خالد الصيانة', fullNameEn: 'Khalid Maintenance', role: 'agent', roleId: roles.agent.id, departmentId: maintenanceDept.id },
    update: {},
  });

  // End user in Finance
  await prisma.user.upsert({
    where: { id: 4 },
    create: { badgeNumber: '20001', username: 'user', passwordHash: hash, fullNameAr: 'سعيد المستخدم', fullNameEn: 'Saeed User', role: 'end_user', roleId: roles.endUser.id, departmentId: financeDept.id },
    update: {},
  });

  console.log('✅ Test users created!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('| Role         | Username | Password |');
  console.log('|━━━━━━━━━━━━━━━━━━━━━━━━|');
  console.log('| Super Admin  | admin    | Test@123 |');
  console.log('| IT Agent     | agent    | Test@123 |');
  console.log('| Maint Agent  | agent2   | Test@123 |');
  console.log('| End User     | user     | Test@123 |');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error).finally(() => prisma.$disconnect());
