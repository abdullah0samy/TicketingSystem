import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize, type AuthRequest } from '../../core/middleware/auth.middleware.ts';

const router = Router();

// Get all assets (scoped by department for non-admin users) — PAGINATED
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page = '1', limit = '50', status, search } = req.query;
    const MAX_PAGE_SIZE = 100;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(parseInt(limit as string) || 50, MAX_PAGE_SIZE);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (req.user!.role !== 'super_admin' && req.user!.role !== 'supervisor') {
      where.departmentId = req.user!.departmentId || -1;
    }
    if (status && status !== 'all') where.status = status;
    if (search) {
      const searchStr = search as string;
      where.OR = [
        { name: { contains: searchStr } },
        { serialNumber: { contains: searchStr } },
        { type: { contains: searchStr } }
      ];
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: { department: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.asset.count({ where })
    ]);

    res.json({
      assets,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Create asset (Admin/Supervisor only)
router.post('/', authenticate, authorize(['super_admin', 'supervisor']), async (req: AuthRequest, res) => {
  try {
    const { name, serialNumber, type, location, departmentId, status, purchaseDate, warrantyExpiry } = req.body;

    // BUG FIX: Add input validation
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const asset = await prisma.asset.create({
      data: {
        name,
        serialNumber,
        type,
        location,
        departmentId: departmentId ? parseInt(departmentId) : null,
        status: status || 'active',
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      },
    });

    // BUG FIX: Add audit logging
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'ASSET_CREATED',
        entityType: 'ASSET',
        entityId: asset.id,
        newData: { name, serialNumber, type, status: status || 'active' }
      }
    });

    res.status(201).json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// Update asset
router.put('/:id', authenticate, authorize(['super_admin', 'supervisor']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, serialNumber, type, location, departmentId, status, purchaseDate, warrantyExpiry } = req.body;

    const existingAsset = await prisma.asset.findUnique({ where: { id: parseInt(id) } });
    if (!existingAsset) return res.status(404).json({ error: 'Asset not found' });

    // VALIDATION: Check max lengths
    if (name !== undefined && name.length > 200) {
      return res.status(400).json({ error: 'Name must be 200 characters or less' });
    }
    if (serialNumber !== undefined && serialNumber.length > 100) {
      return res.status(400).json({ error: 'Serial number must be 100 characters or less' });
    }
    if (type !== undefined && type.length > 100) {
      return res.status(400).json({ error: 'Type must be 100 characters or less' });
    }

    // VALIDATION: Check valid status values
    const validStatuses = ['active', 'maintenance', 'retired'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const asset = await prisma.asset.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(type !== undefined && { type }),
        ...(location !== undefined && { location }),
        ...(departmentId !== undefined && { departmentId: parseInt(departmentId) }),
        ...(status !== undefined && { status }),
        ...(purchaseDate !== undefined && { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }),
        ...(warrantyExpiry !== undefined && { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }),
      },
    });

    // AUDIT LOG
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'ASSET_UPDATED',
        entityType: 'ASSET',
        entityId: asset.id,
        oldData: { name: existingAsset.name, status: existingAsset.status },
        newData: { name, serialNumber, type, status, location }
      }
    });

    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Delete asset
router.delete('/:id', authenticate, authorize(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingAsset = await prisma.asset.findUnique({ where: { id: parseInt(id) } });
    if (!existingAsset) return res.status(404).json({ error: 'Asset not found' });

    // Check if asset has related tickets
    const ticketCount = await prisma.ticket.count({ where: { assetId: parseInt(id) } });
    if (ticketCount > 0) {
      return res.status(400).json({ error: `Cannot delete asset: ${ticketCount} ticket(s) reference this asset` });
    }

    await prisma.asset.delete({
      where: { id: parseInt(id) },
    });

    // AUDIT LOG
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'ASSET_DELETED',
        entityType: 'ASSET',
        entityId: existingAsset.id,
        oldData: { name: existingAsset.name, serialNumber: existingAsset.serialNumber, type: existingAsset.type }
      }
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export default router;
