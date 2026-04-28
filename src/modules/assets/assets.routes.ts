import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize, type AuthRequest } from '../../core/middleware/auth.middleware.ts';

const router = Router();

// Get all assets
router.get('/', authenticate, async (req, res) => {
  try {
    const assets = await prisma.asset.findMany({
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
router.put('/:id', authenticate, authorize(['super_admin', 'supervisor']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, serialNumber, type, location, departmentId, status, purchaseDate, warrantyExpiry } = req.body;
    const asset = await prisma.asset.update({
      where: { id: parseInt(id) },
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
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Delete asset
router.delete('/:id', authenticate, authorize(['super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.asset.delete({
      where: { id: parseInt(id) },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export default router;
