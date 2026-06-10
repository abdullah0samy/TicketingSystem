import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize, type AuthRequest } from '../../core/middleware/auth.middleware.ts';

const router = Router();

// Get all assets
router.get('/', authenticate, async (req, res) => {
  try {
    const assets = await prisma.asset.findMany({
      where: { deletedAt: null },
      include: {
        department: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(assets);
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
    const assetId = parseInt(id);
    const { name, serialNumber, type, location, departmentId, status, purchaseDate, warrantyExpiry } = req.body;

    const oldAsset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!oldAsset || oldAsset.deletedAt) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = await prisma.asset.update({
      where: { id: assetId },
      data: {
        name,
        serialNumber,
        type,
        location,
        departmentId: departmentId ? parseInt(departmentId) : null,
        status,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      },
    });

    const changedFields: Record<string, { old: unknown; new: unknown }> = {};
    for (const key of ['name', 'serialNumber', 'type', 'location', 'departmentId', 'status', 'purchaseDate', 'warrantyExpiry'] as const) {
      const oldVal = (oldAsset as any)[key]?.toISOString?.() ?? (oldAsset as any)[key] ?? null;
      const newVal = (asset as any)[key]?.toISOString?.() ?? (asset as any)[key] ?? null;
      if (String(oldVal) !== String(newVal)) {
        changedFields[key] = { old: oldVal, new: newVal };
      }
    }
    if (Object.keys(changedFields).length > 0) {
      const oldData: any = {};
      const newData: any = {};
      for (const [key, val] of Object.entries(changedFields)) {
        oldData[key] = val.old;
        newData[key] = val.new;
      }
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'ASSET_UPDATED',
          entityType: 'ASSET',
          entityId: assetId,
          oldData,
          newData,
        },
      });
    }

    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Soft-delete asset
router.delete('/:id', authenticate, authorize(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const assetId = parseInt(id);
    await prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'ASSET_DELETED',
        entityType: 'ASSET',
        entityId: assetId,
      },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export default router;
