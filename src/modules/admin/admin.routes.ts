import express from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize } from '../../core/middleware/auth.middleware.ts';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// --- BUILDINGS ---
router.get('/buildings', async (req, res) => {
  try {
    const buildings = await prisma.building.findMany({
      include: { _count: { select: { floors: true } } },
      orderBy: { nameEn: 'asc' }
    });
    res.json(buildings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching buildings' });
  }
});

router.post('/buildings', authorize(['super_admin']), async (req, res) => {
  const { nameAr, nameEn, isActive } = req.body;
  if (!nameAr || !nameEn) return res.status(400).json({ message: 'Names are required' });

  try {
    const building = await prisma.building.create({
      data: { nameAr, nameEn, isActive: isActive ?? true }
    });
    res.status(201).json(building);
  } catch (error) {
    res.status(500).json({ message: 'Error creating building' });
  }
});

router.put('/buildings/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { nameAr, nameEn, isActive } = req.body;

  try {
    const building = await prisma.building.update({
      where: { id: parseInt(id) },
      data: { nameAr, nameEn, isActive }
    });
    res.json(building);
  } catch (error) {
    res.status(500).json({ message: 'Error updating building' });
  }
});

router.delete('/buildings/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.building.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Building deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting building' });
  }
});

// --- FLOORS ---
router.get('/floors', async (req, res) => {
  try {
    const floors = await prisma.floor.findMany({
      include: { building: true },
      orderBy: [{ buildingId: 'asc' }, { nameEn: 'asc' }]
    });
    res.json(floors);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching floors' });
  }
});

router.post('/floors', authorize(['super_admin']), async (req, res) => {
  const { nameAr, nameEn, buildingId, isActive } = req.body;
  if (!nameAr || !nameEn || !buildingId) return res.status(400).json({ message: 'Required fields missing' });

  try {
    const floor = await prisma.floor.create({
      data: { nameAr, nameEn, buildingId: parseInt(buildingId), isActive: isActive ?? true }
    });
    res.status(201).json(floor);
  } catch (error) {
    res.status(500).json({ message: 'Error creating floor' });
  }
});

router.put('/floors/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { nameAr, nameEn, buildingId, isActive } = req.body;

  try {
    const floor = await prisma.floor.update({
      where: { id: parseInt(id) },
      data: { 
        nameAr, 
        nameEn, 
        buildingId: buildingId ? parseInt(buildingId) : undefined, 
        isActive 
      }
    });
    res.json(floor);
  } catch (error) {
    res.status(500).json({ message: 'Error updating floor' });
  }
});

router.delete('/floors/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.floor.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Floor deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting floor' });
  }
});

// --- DEPARTMENTS ---
router.get('/departments', async (req, res) => {
  try {
    const departments = await prisma.department.findMany({
      include: { 
        defaultPermissions: true,
        _count: { select: { users: true } }
      },
      orderBy: { nameEn: 'asc' }
    });
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching departments' });
  }
});

router.post('/departments', authorize(['super_admin']), async (req, res) => {
  const { nameAr, nameEn, descriptionAr, descriptionEn, deptType, isActive, slaHours } = req.body;
  if (!nameAr || !nameEn) return res.status(400).json({ message: 'Names are required' });

  try {
    // Create default permissions first
    const permissions = await prisma.deptPermissions.create({ data: {} });

    const department = await prisma.department.create({
      data: {
        nameAr,
        nameEn,
        descriptionAr,
        descriptionEn,
        deptType: deptType || 'RECEIVER_ONLY',
        isActive: isActive ?? true,
        slaHours: slaHours ? parseInt(slaHours) : 24,
        defaultPermissionsId: permissions.id
      },
      include: { defaultPermissions: true }
    });

    // Log creation
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'DEPT_CREATED',
        entityType: 'DEPARTMENT',
        entityId: department.id,
        newData: { nameEn, deptType, slaHours }
      }
    });

    res.status(201).json(department);
  } catch (error) {
    res.status(500).json({ message: 'Error creating department' });
  }
});

router.put('/departments/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { nameAr, nameEn, descriptionAr, descriptionEn, deptType, isActive, slaHours } = req.body;

  try {
    const oldDept = await prisma.department.findUnique({ where: { id: parseInt(id) } });
    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: {
        nameAr,
        nameEn,
        descriptionAr,
        descriptionEn,
        deptType,
        isActive,
        slaHours: slaHours ? parseInt(slaHours) : undefined
      }
    });

    // Log update
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'DEPT_UPDATED',
        entityType: 'DEPARTMENT',
        entityId: department.id,
        oldData: oldDept ? { nameEn: oldDept.nameEn, isActive: oldDept.isActive } : undefined,
        newData: { nameEn, isActive, deptType }
      }
    });

    res.json(department);
  } catch (error) {
    res.status(500).json({ message: 'Error updating department' });
  }
});

router.delete('/departments/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: { 
        isActive: false, 
        deletedAt: new Date()
      }
    });

    // Log deactivation
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'DEPT_DEACTIVATED',
        entityType: 'DEPARTMENT',
        entityId: department.id
      }
    });
    res.json({ message: 'Department deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting department' });
  }
});

// --- TICKET TYPES ---
router.get('/ticket-types', async (req, res) => {
  try {
    const types = await prisma.ticketType.findMany({
      include: { department: true },
      orderBy: { displayOrder: 'asc' }
    });
    res.json(types);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching ticket types' });
  }
});

router.post('/ticket-types', authorize(['super_admin']), async (req, res) => {
  const { nameAr, nameEn, departmentId, color, displayOrder, isActive, slaHours } = req.body;
  if (!nameAr || !nameEn) return res.status(400).json({ message: 'Names are required' });

  try {
    const type = await prisma.ticketType.create({
      data: {
        nameAr,
        nameEn,
        departmentId: departmentId ? parseInt(departmentId) : null,
        color: color || '#6B7280',
        displayOrder: displayOrder ? parseInt(displayOrder) : 0,
        isActive: isActive ?? true,
        slaHours: slaHours ? parseInt(slaHours) : null,
      },
      include: { department: true }
    });

    // Create manual audit log
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'TICKET_TYPE_CREATED',
        newData: { nameEn, departmentId, slaHours }
      }
    });

    res.status(201).json(type);
  } catch (error) {
    res.status(500).json({ message: 'Error creating ticket type' });
  }
});

router.put('/ticket-types/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { nameAr, nameEn, departmentId, color, displayOrder, isActive, slaHours } = req.body;

  try {
    const oldType = await prisma.ticketType.findUnique({ where: { id: parseInt(id) } });
    const type = await prisma.ticketType.update({
      where: { id: parseInt(id) },
      data: {
        nameAr,
        nameEn,
        departmentId: departmentId ? parseInt(departmentId) : null,
        color,
        displayOrder: displayOrder ? parseInt(displayOrder) : undefined,
        isActive,
        slaHours: slaHours !== undefined ? (slaHours ? parseInt(slaHours) : null) : undefined,
      },
      include: { department: true }
    });

    // Create manual audit log
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'TICKET_TYPE_UPDATED',
        oldData: oldType ? { nameEn: oldType.nameEn, isActive: oldType.isActive } : undefined,
        newData: { nameEn, isActive, slaHours }
      }
    });

    res.json(type);
  } catch (error) {
    res.status(500).json({ message: 'Error updating ticket type' });
  }
});

router.delete('/ticket-types/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const type = await prisma.ticketType.update({ 
      where: { id: parseInt(id) },
      data: { isActive: false }
    });
    
    // Log deletion
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'TICKET_TYPE_DEACTIVATED',
        oldData: { nameEn: type.nameEn, id: type.id }
      }
    });
    
    res.json({ message: 'Ticket type deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Error deactivating ticket type' });
  }
});

// --- USERS / AGENTS ---
router.get('/users', authorize(['super_admin']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { 
        department: true,
        userRole: true,
        permissionsOverride: true
      },
      orderBy: { fullNameEn: 'asc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

router.post('/users', authorize(['super_admin']), async (req, res) => {
  const { badgeNumber, username, email, password, fullNameAr, fullNameEn, role, roleId, departmentId, isActive } = req.body;
  
  if (!badgeNumber || !username || !password || !fullNameAr || !role) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Enforce numeric identifiers (Finger ID Standard)
  if (!/^\d+$/.test(badgeNumber) || !/^\d+$/.test(username)) {
    return res.status(400).json({ message: 'Badge Number and Username must be numeric only' });
  }

  try {
    // BUG FIX: Check for duplicate badge/username before creating
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { badgeNumber },
          { username }
        ]
      }
    });
    if (existing) {
      const field = existing.badgeNumber === badgeNumber ? 'Badge Number' : 'Username';
      return res.status(409).json({ message: `${field} already exists` });
    }

    const hash = await bcrypt.hash(password, 12);
    // Allow permissionsOverride in the created user
    const user = await prisma.user.create({
      data: {
        badgeNumber,
        username,
        email,
        passwordHash: hash,
        fullNameAr,
        fullNameEn,
        role,
        roleId: roleId ? parseInt(roleId) : null,
        departmentId: departmentId ? parseInt(departmentId) : null,
        isActive: isActive ?? true,
        permissionsOverride: req.body.permissionsOverride ? {
          create: req.body.permissionsOverride
        } : undefined
      }
    });

    // Log creation
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: user.id,
        newData: { badgeNumber, username, role, departmentId }
      }
    });

    const { passwordHash: _hash, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (error) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

router.put('/users/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { badgeNumber, username, email, fullNameAr, fullNameEn, role, roleId, departmentId, isActive, forcePasswordChange } = req.body;

  try {
    const oldUser = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if ((badgeNumber && !/^\d+$/.test(badgeNumber)) || (username && !/^\d+$/.test(username))) {
      return res.status(400).json({ message: 'Badge Number and Username must be numeric only' });
    }
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        badgeNumber,
        username,
        email,
        fullNameAr,
        fullNameEn,
        role,
        roleId: roleId ? parseInt(roleId) : null,
        departmentId: departmentId ? parseInt(departmentId) : null,
        isActive,
        forcePasswordChange,
        permissionsOverride: req.body.permissionsOverride ? {
          upsert: {
            create: req.body.permissionsOverride,
            update: req.body.permissionsOverride
          }
        } : undefined
      }
    });

    // Log update
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'USER_UPDATED',
        entityType: 'USER',
        entityId: user.id,
        oldData: oldUser ? { role: oldUser.role, isActive: oldUser.isActive } : undefined,
        newData: { role, isActive, departmentId }
      }
    });

    const { passwordHash: _hash, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

router.post('/users/:id/reset-password', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { password, forcePasswordChange } = req.body;

  if (!password) return res.status(400).json({ message: 'Password is required' });

  try {
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { 
        passwordHash: hash,
        forcePasswordChange: forcePasswordChange ?? true
      }
    });

    // Log password reset
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'PASSWORD_RESET',
        entityType: 'USER',
        entityId: parseInt(id),
        newData: { forcePasswordChange }
      }
    });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password' });
  }
});

router.delete('/users/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { 
        isActive: false, 
        deletedAt: new Date()
      }
    });

    // Log deactivation
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'USER_DEACTIVATED',
        entityType: 'USER',
        entityId: user.id
      }
    });
    res.json({ message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Error deactivating user' });
  }
});

// --- ROLES & PERMISSIONS ---
router.get('/roles', authorize(['super_admin']), async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } }
    });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching roles' });
  }
});

router.post('/roles', authorize(['super_admin']), async (req, res) => {
  const { name, description, permissionIds } = req.body;
  try {
    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          connect: permissionIds?.map((id: number) => ({ id })) || []
        }
      },
      include: { permissions: true }
    });
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ message: 'Error creating role' });
  }
});

router.put('/roles/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { name, description, permissionIds } = req.body;
  try {
    const oldRole = await prisma.role.findUnique({ where: { id: parseInt(id) } });
    const role = await prisma.role.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        permissions: {
          set: permissionIds?.map((id: number) => ({ id })) || []
        }
      },
      include: { permissions: true }
    });

    // Log role update
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'ROLE_UPDATED',
        entityType: 'ROLE',
        entityId: role.id,
        oldData: oldRole ? { name: oldRole.name } : undefined,
        newData: { name, permissionIds }
      }
    });

    res.json(role);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ message: 'Error updating role' });
  }
});

router.delete('/roles/:id', authorize(['super_admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const role = await prisma.role.findUnique({
      where: { id: parseInt(id) },
      include: { _count: { select: { users: true } } }
    });

    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role._count && role._count.users > 0) {
      return res.status(400).json({ message: 'Cannot delete role with active users' });
    }

    await prisma.role.delete({ where: { id: parseInt(id) } });

    // Log deletion
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user.id,
        action: 'ROLE_DELETED',
        oldData: { name: role.name }
      }
    });

    res.json({ message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting role' });
  }
});

router.get('/permissions', authorize(['super_admin']), async (req, res) => {
  try {
    const permissions = await prisma.permission.findMany();
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching permissions' });
  }
});

export default router;
