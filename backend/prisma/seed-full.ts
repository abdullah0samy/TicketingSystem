import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ABCH Ticketing System database with large dataset...');

  // --- CLEANUP ---
  console.log('🧹 Cleaning existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.ticketAttachment.deleteMany();
  await prisma.ticketTransfer.deleteMany();
  await prisma.ticketStatusHistory.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.teamNoteComment.deleteMany();
  await prisma.teamNoteLike.deleteMany();
  await prisma.teamNoteAttachment.deleteMany();
  await prisma.teamNote.deleteMany();
  await prisma.knowledgeArticle.deleteMany();
  await prisma.knowledgeCategory.deleteMany();
  await prisma.exportHistory.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.user.deleteMany();
  await prisma.deptTransferAllowlist.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.deptPermissions.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.building.deleteMany();

  // 1. Create default permissions
  const permissionData = [
    { name: 'view_analytics', description: 'Can view analytics dashboard' },
    { name: 'manage_departments', description: 'Can create and edit departments' },
    { name: 'manage_users', description: 'Can manage all users' },
    { name: 'assign_tickets', description: 'Can assign tickets to agents' },
    { name: 'manage_ticket_types', description: 'Can manage ticket categories' },
    { name: 'manage_buildings', description: 'Can manage buildings and floors' },
    { name: 'view_all_tickets', description: 'Can view all tickets in the system' },
  ];

  const permissions = [];
  for (const p of permissionData) {
    const created = await prisma.permission.create({ data: p });
    permissions.push(created);
  }

  // 2. Create roles
  const roles = [
    { name: 'super_admin', displayNameAr: 'مدير عام', displayNameEn: 'Super Admin', permissions: { connect: permissions.map(p => ({ id: p.id })) } },
    { name: 'admin', displayNameAr: 'مدير', displayNameEn: 'Admin', permissions: { connect: permissions.slice(0, 4).map(p => ({ id: p.id })) } },
    { name: 'supervisor', displayNameAr: 'مشرف', displayNameEn: 'Supervisor', permissions: { connect: permissions.slice(2, 5).map(p => ({ id: p.id })) } },
    { name: 'agent', displayNameAr: 'وكيل', displayNameEn: 'Agent', permissions: { connect: [{ id: permissions[2].id }] } },
    { name: 'end_user', displayNameAr: 'مستخدم', displayNameEn: 'End User', permissions: { connect: [] } },
  ];

  const createdRoles = [];
  for (const r of roles) {
    const created = await prisma.role.create({ data: r });
    createdRoles.push(created);
  }

  // 3. Create departments with default permissions
  const departments = [
    { nameAr: 'تقنية المعلومات', nameEn: 'IT Support', slaHours: 4 },
    { nameAr: 'الصيانة', nameEn: 'Maintenance', slaHours: 8 },
    { nameAr: 'الموارد البشرية', nameEn: 'Human Resources', slaHours: 24 },
    { nameAr: 'المشتريات', nameEn: 'Procurement', slaHours: 48 },
    { nameAr: 'التمريض', nameEn: 'Nursing', slaHours: 2 },
    { nameAr: 'الصيدلية', nameEn: 'Pharmacy', slaHours: 1 },
    { nameAr: 'الأشعة', nameEn: 'Radiology', slaHours: 4 },
    { nameAr: 'المختبر', nameEn: 'Laboratory', slaHours: 4 },
    { nameAr: 'الاستقبال', nameEn: 'Reception', slaHours: 2 },
  ];

  const createdDepartments = [];
  for (const dept of departments) {
    const created = await prisma.department.create({
      data: {
        ...dept,
        defaultPermissions: {
          create: {
            canChangeStatus: true,
            canAssignTickets: true,
            canTransferTickets: false,
            canArchiveTickets: false,
            canViewAllDeptTickets: true,
          },
        },
      },
    });
    createdDepartments.push(created);
  }

  // 4. Create buildings and floors
  const buildings = [
    { nameAr: 'المبنى الرئيسي', nameEn: 'Main Building', floors: ['الطابق الأرضي', 'الطابق الأول', 'الطابق الثاني', 'الطابق الثالث', 'الطابق الرابع'] },
    { nameAr: 'مبنى الطوارئ', nameEn: 'Emergency Building', floors: ['الطابق الأرضي', 'الطابق الأول'] },
    { nameAr: 'مبنى العيادات', nameEn: 'Clinics Building', floors: ['الطابق الأرضي', 'الطابق الأول', 'الطابق الثاني'] },
  ];

  for (const b of buildings) {
    await prisma.building.create({
      data: {
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        floors: {
          create: b.floors.map(f => ({ nameAr: f, nameEn: f })),
        },
      },
    });
  }

  // 5. Create users
  const hashedPassword = await bcrypt.hash('password123', 10);
  const users = [
    { badgeNumber: 'ADM001', username: 'admin', fullNameAr: 'أحمد المدير', fullNameEn: 'Ahmed Admin', role: 'super_admin', departmentIndex: 0 },
    { badgeNumber: 'IT001', username: 'it_supervisor', fullNameAr: 'خالد المشرف', fullNameEn: 'Khaled Supervisor', role: 'supervisor', departmentIndex: 0 },
    { badgeNumber: 'IT002', username: 'it_agent1', fullNameAr: 'محمد فني', fullNameEn: 'Mohamed Technician', role: 'agent', departmentIndex: 0 },
    { badgeNumber: 'IT003', username: 'it_agent2', fullNameAr: 'سارة مهندسة', fullNameEn: 'Sara Engineer', role: 'agent', departmentIndex: 0 },
    { badgeNumber: 'MNT001', username: 'maint_supervisor', fullNameAr: 'علي مشرف صيانة', fullNameEn: 'Ali Maintenance', role: 'supervisor', departmentIndex: 1 },
    { badgeNumber: 'MNT002', username: 'maint_agent', fullNameAr: 'عمر فني صيانة', fullNameEn: 'Omar Technician', role: 'agent', departmentIndex: 1 },
    { badgeNumber: 'HR001', username: 'hr_manager', fullNameAr: 'نورة مديرة موارد', fullNameEn: 'Noura HR', role: 'supervisor', departmentIndex: 2 },
    { badgeNumber: 'NRS001', username: 'nurse1', fullNameAr: 'فاطمة ممرضة', fullNameEn: 'Fatima Nurse', role: 'end_user', departmentIndex: 4 },
    { badgeNumber: 'NRS002', username: 'nurse2', fullNameAr: 'مريم ممرضة', fullNameEn: 'Maryam Nurse', role: 'end_user', departmentIndex: 4 },
    { badgeNumber: 'PHM001', username: 'pharmacist', fullNameAr: 'د. ليلى صيدلانية', fullNameEn: 'Dr. Layla Pharmacist', role: 'end_user', departmentIndex: 5 },
    { badgeNumber: 'RAD001', username: 'radiologist', fullNameAr: 'د. كريم أشعة', fullNameEn: 'Dr. Karim Radiologist', role: 'end_user', departmentIndex: 6 },
    { badgeNumber: 'LAB001', username: 'lab_technician', fullNameAr: 'حسن فني مختبر', fullNameEn: 'Hassan Lab Tech', role: 'end_user', departmentIndex: 7 },
    { badgeNumber: 'PRO001', username: 'procurement', fullNameAr: 'هاني مشتريات', fullNameEn: 'Hani Procurement', role: 'end_user', departmentIndex: 3 },
    { badgeNumber: 'REC001', username: 'receptionist', fullNameAr: 'أمل استقبال', fullNameEn: 'Amal Reception', role: 'end_user', departmentIndex: 8 },
    { badgeNumber: 'PHM002', username: 'pharmacy_sup', fullNameAr: 'د. وليد مشرف صيدلة', fullNameEn: 'Dr. Waleed Pharmacy Sup', role: 'supervisor', departmentIndex: 5 },
  ];

  const createdUsers = [];
  for (const u of users) {
    const user = await prisma.user.create({
      data: {
        badgeNumber: u.badgeNumber,
        username: u.username,
        password: hashedPassword,
        fullNameAr: u.fullNameAr,
        fullNameEn: u.fullNameEn,
        role: u.role,
        departmentId: createdDepartments[u.departmentIndex].id,
        isActive: true,
      },
    });
    createdUsers.push(user);
  }

  // 6. Create ticket types
  const ticketTypes = [
    { nameAr: 'عطل جهاز', nameEn: 'Device Malfunction', isActive: true },
    { nameAr: 'طلب برنامج', nameEn: 'Software Request', isActive: true },
    { nameAr: 'صيانة مكتب', nameEn: 'Office Maintenance', isActive: true },
    { nameAr: 'طلب معدات', nameEn: 'Equipment Request', isActive: true },
    { nameAr: 'مشكلة شبكة', nameEn: 'Network Issue', isActive: true },
    { nameAr: 'طلب صلاحيات', nameEn: 'Permission Request', isActive: true },
    { nameAr: 'شكوى', nameEn: 'Complaint', isActive: true },
    { nameAr: 'استفسار', nameEn: 'Inquiry', isActive: true },
  ];

  const createdTicketTypes = [];
  for (const tt of ticketTypes) {
    const created = await prisma.ticketType.create({ data: tt });
    createdTicketTypes.push(created);
  }

  // 7. Create tickets
  const ticketData = [
    { subject: 'جهاز الكمبيوتر لا يعمل', description: 'شاشة سوداء عند التشغيل', creatorIndex: 7, deptIndex: 0, typeIndex: 0, status: 'open', priority: 'high' },
    { subject: 'طلب تثبيت برنامج محاسبة', description: 'نحتاج تثبيت برنامج المحاسبة على 3 أجهزة', creatorIndex: 8, deptIndex: 2, typeIndex: 1, status: 'in_progress', priority: 'normal' },
    { subject: 'مكيف الهواء لا يبرد', description: 'درجة حرارة الغرفة مرتفعة جداً', creatorIndex: 10, deptIndex: 1, typeIndex: 2, status: 'pending', priority: 'critical' },
    { subject: 'طلب طابعة جديدة', description: 'الطابعة الحالية توقفت عن العمل', creatorIndex: 9, deptIndex: 0, typeIndex: 3, status: 'resolved', priority: 'normal' },
    { subject: 'بطء شديد في الشبكة', description: 'الإنترنت بطيء جداً منذ الصباح', creatorIndex: 11, deptIndex: 0, typeIndex: 4, status: 'in_progress', priority: 'high' },
    { subject: 'طلب صلاحية دخول لنظام المرضى', description: 'ممرضة جديدة تحتاج صلاحية', creatorIndex: 8, deptIndex: 0, typeIndex: 5, status: 'closed', priority: 'normal' },
    { subject: 'شكوى من خدمة الطعام', description: 'جودة الطعام في الكافتيريا سيئة', creatorIndex: 12, deptIndex: 3, typeIndex: 6, status: 'open', priority: 'low' },
    { subject: 'استفسار عن دواء', description: 'هل يتوفر دواء XYZ في الصيدلية؟', creatorIndex: 13, deptIndex: 5, typeIndex: 7, status: 'resolved', priority: 'normal' },
    { subject: 'تسريب مياه من السقف', description: 'تسريب مياه في غرفة الأشعة', creatorIndex: 10, deptIndex: 1, typeIndex: 2, status: 'in_progress', priority: 'critical' },
    { subject: 'عطل في جهاز الأشعة', description: 'جهاز MRI لا يعمل', creatorIndex: 10, deptIndex: 6, typeIndex: 0, status: 'pending', priority: 'critical' },
  ];

  for (const t of ticketData) {
    const deptId = createdDepartments[t.deptIndex].id;
    await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-${String(240514).slice(2)}-${String(ticketData.indexOf(t) + 1).padStart(3, '0')}`,
        subject: t.subject,
        description: t.description,
        departmentId: deptId,
        ticketTypeId: createdTicketTypes[t.typeIndex].id,
        priority: t.priority,
        status: t.status,
        createdById: createdUsers[t.creatorIndex].id,
        creatorName: createdUsers[t.creatorIndex].fullNameEn,
        creatorDeptId: createdDepartments[t.deptIndex].id,
        creatorDeptName: createdDepartments[t.deptIndex].nameEn,
        completedAt: t.status === 'resolved' ? new Date() : null,
        closedAt: t.status === 'closed' ? new Date() : null,
        auditLogs: {
          create: {
            userId: createdUsers[t.creatorIndex].id,
            action: 'TICKET_CREATED',
            departmentId: deptId,
            newData: { subject: t.subject, status: t.status },
          },
        },
      },
    });
  }

  console.log(`✅ Created ${ticketData.length} tickets`);

  // 8. Create team notes
  const noteData = [
    { contentAr: 'اجتماع الصيانة اليوم الساعة 10 صباحاً', contentEn: 'Maintenance meeting today at 10 AM', userIndex: 4, deptIndex: 1 },
    { contentAr: 'تحديث نظام التذاكر الأسبوع المقبل', contentEn: 'Ticket system update next week', userIndex: 1, deptIndex: 0 },
    { contentAr: 'عدد الممرضات الجدد هذا الشهر 5', contentEn: 'New nurses this month: 5', userIndex: 2, deptIndex: 2 },
  ];

  for (const n of noteData) {
    await prisma.teamNote.create({
      data: {
        contentAr: n.contentAr,
        contentEn: n.contentEn,
        authorId: createdUsers[n.userIndex].id,
        departmentId: createdDepartments[n.deptIndex].id,
      },
    });
  }

  console.log('✅ Seeding complete!');
  console.log('📋 Login credentials:');
  console.log('   Super Admin: admin / password123');
  console.log('   Supervisor: it_supervisor / password123');
  console.log('   Agent: it_agent1 / password123');
  console.log('   End User: nurse1 / password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
