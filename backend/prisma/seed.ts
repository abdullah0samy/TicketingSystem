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

  // 2. Create default roles
  const superAdminRole = await prisma.role.create({
    data: {
      name: 'Super Admin',
      description: 'Full system access',
      permissions: { connect: permissions.map(p => ({ id: p.id })) }
    }
  });

  const agentRole = await prisma.role.create({
    data: {
      name: 'Agent',
      description: 'Support staff',
      permissions: { connect: [{ name: 'assign_tickets' }] }
    }
  });

  const supervisorRole = await prisma.role.create({
    data: {
      name: 'Supervisor',
      description: 'Department supervisor',
      permissions: {
        connect: [{ name: 'assign_tickets' }, { name: 'view_analytics' }]
      }
    }
  });

  const endUserRole = await prisma.role.create({
    data: {
      name: 'End User',
      description: 'Standard user',
    }
  });

  // 3. Dept Permissions
  const receiverPerms = await prisma.deptPermissions.create({
    data: {
      canReceiveTickets: true, canSendTickets: false,
      canViewAllDeptTickets: true, canAssignTickets: true,
      canChangeStatus: true, canTransferTickets: true,
      canArchiveTickets: true, canExportData: true,
      canViewAnalytics: true, canManageTeamNotes: true,
      canManageDeptUsers: false,
    }
  });

  const senderPerms = await prisma.deptPermissions.create({
    data: {
      canReceiveTickets: false, canSendTickets: true,
      canViewAllDeptTickets: false, canAssignTickets: false,
      canChangeStatus: false, canTransferTickets: false,
      canArchiveTickets: false, canExportData: false,
      canViewAnalytics: false, canManageTeamNotes: false,
      canManageDeptUsers: false,
    }
  });

  const bothPerms = await prisma.deptPermissions.create({
    data: {
      canReceiveTickets: true, canSendTickets: true,
      canViewAllDeptTickets: true, canAssignTickets: true,
      canChangeStatus: true, canTransferTickets: true,
      canArchiveTickets: true, canExportData: true,
      canViewAnalytics: true, canManageTeamNotes: true,
      canManageDeptUsers: true,
    }
  });

  // 4. Departments
  const deptNames = [
    { ar: 'تقنية المعلومات', en: 'Information Technology', type: 'BOTH' },
    { ar: 'الصيانة الهندسية', en: 'Engineering Maintenance', type: 'RECEIVER_ONLY' },
    { ar: 'الموارد البشرية', en: 'Human Resources', type: 'BOTH' },
    { ar: 'الشؤون المالية', en: 'Finance', type: 'SENDER_ONLY' },
    { ar: 'الهندسة الطبية', en: 'Biomedical Engineering', type: 'RECEIVER_ONLY' },
    { ar: 'التمريض', en: 'Nursing', type: 'BOTH' },
    { ar: 'الصيدلية', en: 'Pharmacy', type: 'RECEIVER_ONLY' },
    { ar: 'الأشعة', en: 'Radiology', type: 'RECEIVER_ONLY' },
    { ar: 'المختبر', en: 'Laboratory', type: 'RECEIVER_ONLY' },
    { ar: 'الجودة', en: 'Quality Assurance', type: 'BOTH' },
  ];

  const departments = [];
  for (const d of deptNames) {
    const dept = await prisma.department.create({
      data: {
        nameAr: d.ar,
        nameEn: d.en,
        deptType: d.type,
        defaultPermissionsId: d.type === 'SENDER_ONLY' ? senderPerms.id : (d.type === 'BOTH' ? bothPerms.id : receiverPerms.id),
        slaHours: d.en === 'Information Technology' ? 4 : 24
      }
    });
    departments.push(dept);
  }

  // 5. Buildings & Floors
  const buildings = [];
  for (let i = 1; i <= 3; i++) {
    const b = await prisma.building.create({
      data: {
        nameAr: `مبنى ${i}`,
        nameEn: `Building ${String.fromCharCode(64 + i)}`,
        floors: {
          create: [
            { nameAr: 'الدور الأرضي', nameEn: 'Ground Floor' },
            { nameAr: 'الدور الأول', nameEn: 'Floor 1' },
            { nameAr: 'الدور الثاني', nameEn: 'Floor 2' },
          ]
        }
      },
      include: { floors: true }
    });
    buildings.push(b);
  }

  // 6. Ticket Types
  const ticketTypes = [];
  const commonTypes = [
    { nameAr: 'مشكلة تقنية', nameEn: 'Technical Issue', color: '#3B82F6' },
    { nameAr: 'طلب صيانة', nameEn: 'Maintenance Request', color: '#EF4444' },
    { nameAr: 'استفسار عام', nameEn: 'General Inquiry', color: '#10B981' },
    { nameAr: 'طلب صلاحية', nameEn: 'Access Request', color: '#8B5CF6' },
  ];

  for (const dept of departments) {
    if (dept.deptType === 'SENDER_ONLY') continue;
    for (const ct of commonTypes) {
      const tt = await prisma.ticketType.create({
        data: {
          ...ct,
          departmentId: dept.id,
          slaHours: Math.floor(Math.random() * 48) + 2
        }
      });
      ticketTypes.push(tt);
    }
  }

  // 7. Users
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const users = [];

  // Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      badgeNumber: '00001', username: '00001', passwordHash,
      fullNameAr: 'مدير النظام', fullNameEn: 'System Admin',
      role: 'super_admin', roleId: superAdminRole.id
    }
  });
  users.push(superAdmin);

  // Abdullah Samy (Agent in IT)
  const abdullah = await prisma.user.create({
    data: {
      badgeNumber: '10001', username: '10001', passwordHash,
      fullNameAr: 'عبدالله سامي', fullNameEn: 'Abdullah Samy',
      role: 'agent', roleId: agentRole.id, departmentId: departments[0].id
    }
  });
  users.push(abdullah);

  // Ibrahim Eid (End User in Finance)
  const ibrahim = await prisma.user.create({
    data: {
      badgeNumber: '20001', username: '20001', passwordHash,
      fullNameAr: 'إبراهيم عيد', fullNameEn: 'Ibrahim Eid',
      role: 'end_user', roleId: endUserRole.id, departmentId: departments[3].id
    }
  });
  users.push(ibrahim);

  // Generate 50+ more users
  const firstNamesAr = ['محمد', 'أحمد', 'علي', 'عمر', 'خالد', 'فهد', 'سعد', 'ياسر', 'نايف', 'فيصل'];
  const lastNamesAr = ['العتيبي', 'القحطاني', 'الشمري', 'الدوسري', 'المطيري', 'الغامدي', 'الزهراني', 'الشهري'];
  const firstNamesEn = ['Mohamed', 'Ahmed', 'Ali', 'Omar', 'Khaled', 'Fahad', 'Saad', 'Yasser', 'Naif', 'Faisal'];
  const lastNamesEn = ['Otaibi', 'Qahtani', 'Shammary', 'Dossary', 'Mutairi', 'Ghamdi', 'Zahrani', 'Shehri'];

  for (let i = 1; i <= 57; i++) {
    const dept = departments[Math.floor(Math.random() * departments.length)];
    const roleChoice = Math.random();
    let role = 'end_user';
    let roleId = endUserRole.id;

    if (roleChoice > 0.8) {
      role = 'agent';
      roleId = agentRole.id;
    } else if (roleChoice > 0.95) {
      role = 'supervisor';
      roleId = supervisorRole.id;
    }

    const idx = i % 10;
    const lIdx = i % 8;

    const user = await prisma.user.create({
      data: {
        badgeNumber: (30000 + i).toString(),
        username: (30000 + i).toString(),
        passwordHash,
        fullNameAr: `${firstNamesAr[idx]} ${lastNamesAr[lIdx]}`,
        fullNameEn: `${firstNamesEn[idx]} ${lastNamesEn[lIdx]}`,
        role,
        roleId,
        departmentId: dept.id
      }
    });
    users.push(user);
  }

  // 8. Assets
  const assets = [];
  for (let i = 1; i <= 20; i++) {
    const asset = await prisma.asset.create({
      data: {
        name: `Asset ${i}`,
        serialNumber: `SN-${1000 + i}`,
        type: i % 2 === 0 ? 'Medical Device' : 'IT Hardware',
        status: 'active',
        departmentId: departments[i % departments.length].id
      }
    });
    assets.push(asset);
  }

  // 9. Tickets (1200+)
  console.log('🎫 Generating 1200+ tickets...');
  const statuses = ['pending', 'open', 'in_progress', 'resolved', 'closed'];
  const priorities = ['low', 'normal', 'high', 'urgent'];
  const subjects = [
    'Network connection issue', 'Printer not working', 'Software installation request',
    'AC leaking in room', 'Light bulb replacement', 'Broken chair',
    'Access card not working', 'New employee onboarding', 'Payroll inquiry',
    'Medical device calibration', 'System slow performance', 'Email not syncing'
  ];

  const tickets = [];
  const batchSize = 100;
  
  for (let i = 0; i < 1200; i++) {
    const creator = users[Math.floor(Math.random() * users.length)];
    const targetDept = departments[Math.floor(Math.random() * departments.length)];
    const building = buildings[Math.floor(Math.random() * buildings.length)];
    const floor = building.floors[Math.floor(Math.random() * building.floors.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];
    const deptTicketTypes = ticketTypes.filter(tt => tt.departmentId === targetDept.id);
    const ticketType = deptTicketTypes.length > 0 ? deptTicketTypes[Math.floor(Math.random() * deptTicketTypes.length)] : null;
    
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30)); // Last 30 days
    
    const slaHours = ticketType?.slaHours || targetDept.slaHours || 24;
    const slaDeadline = new Date(createdAt);
    slaDeadline.setHours(slaDeadline.getHours() + slaHours);

    let completedAt = null;
    let closedAt = null;
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

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-${createdAt.toISOString().slice(2, 10).replace(/-/g, '')}-${(i + 1).toString().padStart(4, '0')}`,
        subject: subjects[i % subjects.length],
        description: `This is a detailed description for ticket ${i + 1}. The user is experiencing issues with ${subjects[i % subjects.length].toLowerCase()}.`,
        createdById: creator.id,
        creatorName: creator.fullNameEn || creator.fullNameAr,
        creatorDeptId: creator.departmentId,
        departmentId: targetDept.id,
        buildingId: building.id,
        buildingName: building.nameEn,
        floorId: floor.id,
        floorName: floor.nameEn,
        status,
        priority,
        ticketTypeId: ticketType?.id,
        assignedToId: assignedTo?.id,
        createdAt,
        slaDeadline,
        completedAt,
        closedAt,
        rating: (status === 'closed') ? Math.floor(Math.random() * 3) + 3 : null, // 3-5 stars
        feedback: (status === 'closed' && Math.random() > 0.5) ? 'Great service, thank you!' : null,
        auditLogs: {
          create: [
            {
              userId: creator.id,
              action: 'TICKET_CREATED',
              departmentId: targetDept.id,
              createdAt: createdAt
            }
          ]
        }
      }
    });

    // Add assignment audit log
    if (assignedTo) {
      await prisma.auditLog.create({
        data: {
          ticketId: ticket.id,
          userId: superAdmin.id, // Assume admin assigned it
          action: 'ASSIGNED',
          departmentId: targetDept.id,
          newData: { toId: assignedTo.id, toName: assignedTo.fullNameEn },
          createdAt: new Date(createdAt.getTime() + 1000 * 60 * 30) // 30 mins later
        }
      });
    }

    // Add status change audit log
    if (status === 'resolved' || status === 'closed') {
      await prisma.auditLog.create({
        data: {
          ticketId: ticket.id,
          userId: assignedTo?.id || superAdmin.id,
          action: 'STATUS_CHANGED',
          departmentId: targetDept.id,
          newData: { to: status },
          createdAt: completedAt || new Date()
        }
      });
    }

    if (i % batchSize === 0) console.log(`   Processed ${i} tickets...`);
  }

  console.log('✅ Large dataset seeding complete!');
  console.log(`   Total Users: ${users.length}`);
  console.log(`   Total Departments: ${departments.length}`);
  console.log(`   Total Tickets: 1200`);
  console.log('   Super Admin → badge: 00001 / pass: Admin@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
