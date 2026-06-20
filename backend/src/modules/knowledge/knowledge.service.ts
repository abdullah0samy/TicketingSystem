import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function normalizeArabic(s: string): string {
  return s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[\u064B-\u065F]/g, '');
}

@Injectable()
export class KnowledgeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async checkKbPermission(userId: number, userRole: string, departmentId: number | null): Promise<boolean> {
    if (userRole === 'super_admin') return true;
    const userOverride = await this.prisma.userPermissionOverride.findUnique({ where: { userId } });
    if (userOverride && userOverride.canManageKnowledgeBase !== null) return userOverride.canManageKnowledgeBase;
    if (departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: departmentId },
        include: { defaultPermissions: true }
      });
      if (dept?.defaultPermissions) return dept.defaultPermissions.canManageKnowledgeBase;
    }
    return false;
  }

  async findAll(page: number = 1, limit: number = 20, search: string = '', categoryId?: number) {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;
    const where: any = { isActive: true };
    if (categoryId) where.categoryId = categoryId;
    if (search.trim()) {
      const normalizedSearch = normalizeArabic(search.trim());
      where.OR = [
        { titleAr: { contains: normalizedSearch, mode: 'insensitive' } },
        { titleEn: { contains: normalizedSearch, mode: 'insensitive' } },
        { contentAr: { contains: normalizedSearch, mode: 'insensitive' } },
        { contentEn: { contains: normalizedSearch, mode: 'insensitive' } },
        { category: { nameAr: { contains: normalizedSearch, mode: 'insensitive' } } },
        { category: { nameEn: { contains: normalizedSearch, mode: 'insensitive' } } },
      ];
    }
    const [articles, total] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        where,
        include: { category: true, author: { select: { fullNameAr: true, fullNameEn: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      this.prisma.knowledgeArticle.count({ where })
    ]);
    return { data: articles, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  async findCategories() {
    return this.prisma.knowledgeCategory.findMany({
      include: { _count: { select: { articles: true } } }
    });
  }

  async search(q: string, page: number = 1, limit: number = 20) {
    if (!q) return { data: [], pagination: { total: 0, page: 1, limit: Number(limit), pages: 0 } };
    const searchStr = normalizeArabic(q);
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;
    const where: any = {
      isActive: true,
      OR: [
        { titleAr: { contains: searchStr, mode: 'insensitive' } },
        { titleEn: { contains: searchStr, mode: 'insensitive' } },
        { contentAr: { contains: searchStr, mode: 'insensitive' } },
        { contentEn: { contains: searchStr, mode: 'insensitive' } },
      ]
    };
    const [articles, total] = await Promise.all([
      this.prisma.knowledgeArticle.findMany({
        where,
        include: { category: true, author: { select: { fullNameAr: true, fullNameEn: true } } },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.knowledgeArticle.count({ where })
    ]);
    return { data: articles, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } };
  }

  async suggest(q: string) {
    if (!q || q.trim().length < 3) return [];
    const searchStr = normalizeArabic(q.trim());
    const words = searchStr.split(/\s+/).filter(w => w.length >= 4);
    const exactMatches = await this.prisma.knowledgeArticle.findMany({
      where: {
        isActive: true,
        OR: [
          { titleAr: { contains: searchStr, mode: 'insensitive' } },
          { titleEn: { contains: searchStr, mode: 'insensitive' } },
          { contentAr: { contains: searchStr, mode: 'insensitive' } },
          { contentEn: { contains: searchStr, mode: 'insensitive' } },
        ]
      },
      include: { category: true },
      orderBy: { views: 'desc' },
      take: 3
    });
    if (exactMatches.length >= 3) {
      return exactMatches.map(a => ({
        id: a.id, titleAr: a.titleAr, titleEn: a.titleEn, views: a.views, category: a.category,
        snippetEn: a.contentEn.substring(0, 120) + (a.contentEn.length > 120 ? '...' : ''),
        snippetAr: a.contentAr.substring(0, 120) + (a.contentAr.length > 120 ? '...' : ''),
      }));
    }
    const wordConditions = words.flatMap(word => ([
      { titleAr: { contains: word, mode: 'insensitive' as const } },
      { titleEn: { contains: word, mode: 'insensitive' as const } },
      { contentAr: { contains: word, mode: 'insensitive' as const } },
      { contentEn: { contains: word, mode: 'insensitive' as const } },
    ]));
    const wordMatches = wordConditions.length > 0
      ? await this.prisma.knowledgeArticle.findMany({
          where: { isActive: true, id: { notIn: exactMatches.map(a => a.id) }, OR: wordConditions },
          include: { category: true },
          orderBy: { views: 'desc' },
          take: 3 - exactMatches.length
        })
      : [];
    const combined = [...exactMatches, ...wordMatches];
    return combined.map(a => ({
      id: a.id, titleAr: a.titleAr, titleEn: a.titleEn, views: a.views, category: a.category,
      snippetEn: a.contentEn.substring(0, 120) + (a.contentEn.length > 120 ? '...' : ''),
      snippetAr: a.contentAr.substring(0, 120) + (a.contentAr.length > 120 ? '...' : ''),
    }));
  }

  async create(userId: number, userRole: string, departmentId: number | null, body: any) {
    const hasPerm = await this.checkKbPermission(userId, userRole, departmentId);
    if (!hasPerm) throw new ForbiddenException('Insufficient permissions to manage Knowledge Base');
    const { titleAr, titleEn, contentAr, contentEn, categoryId } = body;
    if (!titleAr || !titleEn || !contentAr || !contentEn || !categoryId) {
      throw new BadRequestException('Missing required fields');
    }
    const article = await this.prisma.knowledgeArticle.create({
      data: { titleAr, titleEn, contentAr, contentEn, categoryId: parseInt(categoryId), authorId: userId },
      include: { category: true }
    });
    await this.prisma.auditLog.create({
      data: { userId, action: 'ARTICLE_CREATED', newData: { titleAr, titleEn, categoryId }, entityType: 'KB_ARTICLE', entityId: article.id }
    });
    return article;
  }

  async update(userId: number, id: number, userRole: string, departmentId: number | null, body: any) {
    const hasPerm = await this.checkKbPermission(userId, userRole, departmentId);
    if (!hasPerm) throw new ForbiddenException('Insufficient permissions to manage Knowledge Base');
    const oldArticle = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!oldArticle) throw new NotFoundException('Article not found');
    const { titleAr, titleEn, contentAr, contentEn, categoryId, isActive } = body;
    const article = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        titleAr, titleEn, contentAr, contentEn,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        isActive,
      },
      include: { category: true }
    });
    await this.prisma.auditLog.create({
      data: {
        userId, action: 'ARTICLE_UPDATED',
        oldData: { titleAr: oldArticle.titleAr, titleEn: oldArticle.titleEn },
        newData: { titleAr, titleEn, categoryId, isActive },
        entityType: 'KB_ARTICLE', entityId: article.id
      }
    });
    return article;
  }

  async remove(userId: number, id: number, userRole: string, departmentId: number | null) {
    const hasPerm = await this.checkKbPermission(userId, userRole, departmentId);
    if (!hasPerm) throw new ForbiddenException('Insufficient permissions to manage Knowledge Base');
    const article = await this.prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');
    await this.prisma.knowledgeArticle.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId, action: 'ARTICLE_DELETED',
        oldData: { titleAr: article.titleAr, titleEn: article.titleEn },
        entityType: 'KB_ARTICLE', entityId: id
      }
    });
  }

  async incrementView(id: number) {
    await this.prisma.knowledgeArticle.update({ where: { id }, data: { views: { increment: 1 } } });
  }

  async createCategory(userId: number, userRole: string, departmentId: number | null, body: any) {
    const hasPerm = await this.checkKbPermission(userId, userRole, departmentId);
    if (!hasPerm) throw new ForbiddenException('Insufficient permissions');
    const { nameAr, nameEn } = body;
    const category = await this.prisma.knowledgeCategory.create({ data: { nameAr, nameEn } });
    await this.prisma.auditLog.create({
      data: { userId, action: 'CATEGORY_CREATED', newData: { nameAr, nameEn }, entityType: 'KB_CATEGORY', entityId: category.id }
    });
    return category;
  }

  async updateCategory(userId: number, id: number, userRole: string, departmentId: number | null, body: any) {
    const hasPerm = await this.checkKbPermission(userId, userRole, departmentId);
    if (!hasPerm) throw new ForbiddenException('Insufficient permissions');
    const { nameAr, nameEn } = body;
    const oldCat = await this.prisma.knowledgeCategory.findUnique({ where: { id } });
    if (!oldCat) throw new NotFoundException('Category not found');
    const category = await this.prisma.knowledgeCategory.update({ where: { id }, data: { nameAr, nameEn } });
    await this.prisma.auditLog.create({
      data: {
        userId, action: 'CATEGORY_UPDATED',
        oldData: { nameAr: oldCat.nameAr, nameEn: oldCat.nameEn },
        newData: { nameAr, nameEn },
        entityType: 'KB_CATEGORY', entityId: id
      }
    });
    return category;
  }

  async removeCategory(userId: number, id: number, userRole: string, departmentId: number | null) {
    const hasPerm = await this.checkKbPermission(userId, userRole, departmentId);
    if (!hasPerm) throw new ForbiddenException('Insufficient permissions');
    const count = await this.prisma.knowledgeArticle.count({ where: { categoryId: id } });
    if (count > 0) throw new BadRequestException('Cannot delete category with active articles');
    const cat = await this.prisma.knowledgeCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.prisma.knowledgeCategory.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId, action: 'CATEGORY_DELETED',
        oldData: { nameAr: cat.nameAr, nameEn: cat.nameEn },
        entityType: 'KB_CATEGORY', entityId: id
      }
    });
  }
}
