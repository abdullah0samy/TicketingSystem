import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.asset.findMany({
      where: { deletedAt: null },
      include: { department: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: number, body: any) {
    const { name, serialNumber, type, location, departmentId, status, purchaseDate, warrantyExpiry } = body;

    if (!name || !type) {
      throw new BadRequestException({ error: 'Name and type are required' });
    }

    const asset = await this.prisma.asset.create({
      data: {
        name, serialNumber, type, location,
        departmentId: departmentId ? parseInt(departmentId) : null,
        status: status || 'active',
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId, action: 'ASSET_CREATED', entityType: 'ASSET', entityId: asset.id,
        newData: { name, serialNumber, type, status: status || 'active' },
      },
    });

    return asset;
  }

  async update(userId: number, id: number, body: any) {
    const oldAsset = await this.prisma.asset.findUnique({ where: { id } });
    if (!oldAsset || oldAsset.deletedAt) throw new NotFoundException('Asset not found');

    const { name, serialNumber, type, location, departmentId, status, purchaseDate, warrantyExpiry } = body;

    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        name, serialNumber, type, location,
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
      await this.prisma.auditLog.create({
        data: {
          userId, action: 'ASSET_UPDATED', entityType: 'ASSET', entityId: id,
          oldData, newData,
        },
      });
    }

    return asset;
  }

  async remove(userId: number, id: number) {
    await this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { userId, action: 'ASSET_DELETED', entityType: 'ASSET', entityId: id },
    });
  }
}
