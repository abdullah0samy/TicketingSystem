import { Router } from 'express';
import prisma from '../../core/db.ts';
import { authenticate, authorize, type AuthRequest } from '../../core/middleware/auth.middleware.ts';

const router = Router();

// Helper to check for Knowledge Base management permission
async function checkKbPermission(userId: number, userRole: string, departmentId: number | null): Promise<boolean> {
  if (userRole === 'super_admin') return true;
  
  // Check user override
  const userOverride = await prisma.userPermissionOverride.findUnique({
    where: { userId }
  });
  
  if (userOverride && userOverride.canManageKnowledgeBase !== null) {
    return userOverride.canManageKnowledgeBase;
  }
  
  // Check department default
  if (departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { defaultPermissions: true }
    });
    if (dept?.defaultPermissions) {
      return dept.defaultPermissions.canManageKnowledgeBase;
    }
  }
  
  return false;
}

// Get all articles with pagination, search, and category filtering
router.get('/articles', authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      search = '', 
      categoryId 
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const searchStr = search as string;

    const where: any = { isActive: true };

    if (categoryId) {
      where.categoryId = Number(categoryId);
    }

    if (searchStr.trim()) {
      where.OR = [
        { titleAr: { contains: searchStr, mode: 'insensitive' } },
        { titleEn: { contains: searchStr, mode: 'insensitive' } },
        { contentAr: { contains: searchStr, mode: 'insensitive' } },
        { contentEn: { contains: searchStr, mode: 'insensitive' } },
        { category: { nameAr: { contains: searchStr, mode: 'insensitive' } } },
        { category: { nameEn: { contains: searchStr, mode: 'insensitive' } } },
      ];
    }

    const [articles, total] = await Promise.all([
      prisma.knowledgeArticle.findMany({
        where,
        include: {
          category: true,
          author: {
            select: { fullNameAr: true, fullNameEn: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.knowledgeArticle.count({ where })
    ]);

    res.json({
      articles,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching Articles:', error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get categories
router.get('/categories', authenticate, async (req, res) => {
  try {
    const categories = await prisma.knowledgeCategory.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create article
router.post('/articles', authenticate, async (req: AuthRequest, res) => {
  try {
    const { titleAr, titleEn, contentAr, contentEn, categoryId } = req.body;
    
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const hasPerm = await checkKbPermission(req.user.id, req.user.role, req.user.departmentId || null);
    if (!hasPerm) return res.status(403).json({ error: 'Insufficient permissions to manage Knowledge Base' });

    if (!titleAr || !titleEn || !contentAr || !contentEn || !categoryId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const article = await prisma.knowledgeArticle.create({
      data: {
        titleAr,
        titleEn,
        contentAr,
        contentEn,
        categoryId: parseInt(categoryId),
        authorId: req.user.id,
      },
      include: { category: true }
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ARTICLE_CREATED',
        newData: { titleAr, titleEn, categoryId },
        entityType: 'KB_ARTICLE',
        entityId: article.id
      }
    });

    res.status(201).json(article);
  } catch (error) {
    console.error('KB Error:', error);
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// Update article
router.put('/articles/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { titleAr, titleEn, contentAr, contentEn, categoryId, isActive } = req.body;

    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const hasPerm = await checkKbPermission(req.user.id, req.user.role, req.user.departmentId || null);
    if (!hasPerm) return res.status(403).json({ error: 'Insufficient permissions to manage Knowledge Base' });

    const oldArticle = await prisma.knowledgeArticle.findUnique({ where: { id: parseInt(id) } });
    if (!oldArticle) return res.status(404).json({ error: 'Article not found' });

    const article = await prisma.knowledgeArticle.update({
      where: { id: parseInt(id) },
      data: {
        titleAr,
        titleEn,
        contentAr,
        contentEn,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        isActive,
      },
      include: { category: true }
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ARTICLE_UPDATED',
        oldData: { titleAr: oldArticle.titleAr, titleEn: oldArticle.titleEn },
        newData: { titleAr, titleEn, categoryId, isActive },
        entityType: 'KB_ARTICLE',
        entityId: article.id
      }
    });

    res.json(article);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// Delete article
router.delete('/articles/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const hasPerm = await checkKbPermission(req.user.id, req.user.role, req.user.departmentId || null);
    if (!hasPerm) return res.status(403).json({ error: 'Insufficient permissions to manage Knowledge Base' });

    const article = await prisma.knowledgeArticle.findUnique({ where: { id: parseInt(id) } });
    if (!article) return res.status(404).json({ error: 'Article not found' });

    await prisma.knowledgeArticle.delete({
      where: { id: parseInt(id) }
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ARTICLE_DELETED',
        oldData: { titleAr: article.titleAr, titleEn: article.titleEn },
        entityType: 'KB_ARTICLE',
        entityId: article.id
      }
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Increment views
router.post('/articles/:id/view', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.knowledgeArticle.update({
      where: { id: parseInt(id) },
      data: { views: { increment: 1 } }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to increment views' });
  }
});

// Search articles
router.get('/search', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const searchStr = q as string;

  try {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        isActive: true,
        OR: [
          { titleAr: { contains: searchStr, mode: 'insensitive' } },
          { titleEn: { contains: searchStr, mode: 'insensitive' } },
          { contentAr: { contains: searchStr, mode: 'insensitive' } },
          { contentEn: { contains: searchStr, mode: 'insensitive' } },
        ]
      },
      include: {
        category: true,
        author: { select: { fullNameAr: true, fullNameEn: true } }
      },
      take: 20
    });
    res.json(articles);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- CATEGORY MANAGEMENT ---

router.post('/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const { nameAr, nameEn } = req.body;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const hasPerm = await checkKbPermission(req.user.id, req.user.role, req.user.departmentId || null);
    if (!hasPerm) return res.status(403).json({ error: 'Insufficient permissions' });

    const category = await prisma.knowledgeCategory.create({
      data: { nameAr, nameEn }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CATEGORY_CREATED',
        newData: { nameAr, nameEn },
        entityType: 'KB_CATEGORY',
        entityId: category.id
      }
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { nameAr, nameEn } = req.body;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const hasPerm = await checkKbPermission(req.user.id, req.user.role, req.user.departmentId || null);
    if (!hasPerm) return res.status(403).json({ error: 'Insufficient permissions' });

    const oldCat = await prisma.knowledgeCategory.findUnique({ where: { id: parseInt(id) } });
    const category = await prisma.knowledgeCategory.update({
      where: { id: parseInt(id) },
      data: { nameAr, nameEn }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CATEGORY_UPDATED',
        oldData: { nameAr: oldCat?.nameAr, nameEn: oldCat?.nameEn },
        newData: { nameAr, nameEn },
        entityType: 'KB_CATEGORY',
        entityId: category.id
      }
    });

    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const hasPerm = await checkKbPermission(req.user.id, req.user.role, req.user.departmentId || null);
    if (!hasPerm) return res.status(403).json({ error: 'Insufficient permissions' });

    const count = await prisma.knowledgeArticle.count({
      where: { categoryId: parseInt(id) }
    });
    if (count > 0) {
      return res.status(400).json({ error: 'Cannot delete category with active articles' });
    }

    const cat = await prisma.knowledgeCategory.findUnique({ where: { id: parseInt(id) } });
    await prisma.knowledgeCategory.delete({
      where: { id: parseInt(id) }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CATEGORY_DELETED',
        oldData: { nameAr: cat?.nameAr, nameEn: cat?.nameEn },
        entityType: 'KB_CATEGORY',
        entityId: parseInt(id)
      }
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// --- AI-STYLE TICKET SUGGESTION ENDPOINT ---
// BUG FIX #9: Return top 3 matching KB articles for a given query string.
// Used by the New Ticket form to surface relevant self-service articles.
router.get('/suggest', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    return res.json([]);
  }

  const searchStr = q.trim();

  try {
    // Extract meaningful words (4+ chars) to build a relevance-oriented search
    const words = searchStr.split(/\s+/).filter(w => w.length >= 4);
    const primaryQuery = searchStr; // Full phrase first

    // 1. Try exact phrase across both languages
    const exactMatches = await prisma.knowledgeArticle.findMany({
      where: {
        isActive: true,
        OR: [
          { titleAr: { contains: primaryQuery, mode: 'insensitive' } },
          { titleEn: { contains: primaryQuery, mode: 'insensitive' } },
          { contentAr: { contains: primaryQuery, mode: 'insensitive' } },
          { contentEn: { contains: primaryQuery, mode: 'insensitive' } },
        ]
      },
      include: { category: true },
      orderBy: { views: 'desc' },
      take: 3
    });

    if (exactMatches.length >= 3) {
      return res.json(exactMatches.map(a => ({
        id: a.id,
        titleAr: a.titleAr,
        titleEn: a.titleEn,
        views: a.views,
        category: a.category,
        // Compute a short snippet for display
        snippetEn: a.contentEn.substring(0, 120) + (a.contentEn.length > 120 ? '...' : ''),
        snippetAr: a.contentAr.substring(0, 120) + (a.contentAr.length > 120 ? '...' : ''),
      })));
    }

    // 2. Fallback: word-level union search if exact phrase yields < 3
    const wordConditions = words.flatMap(word => ([
      { titleAr: { contains: word, mode: 'insensitive' as const } },
      { titleEn: { contains: word, mode: 'insensitive' as const } },
      { contentAr: { contains: word, mode: 'insensitive' as const } },
      { contentEn: { contains: word, mode: 'insensitive' as const } },
    ]));

    const wordMatches = wordConditions.length > 0
      ? await prisma.knowledgeArticle.findMany({
          where: {
            isActive: true,
            id: { notIn: exactMatches.map(a => a.id) }, // Exclude already found
            OR: wordConditions
          },
          include: { category: true },
          orderBy: { views: 'desc' },
          take: 3 - exactMatches.length
        })
      : [];

    const combined = [...exactMatches, ...wordMatches];

    res.json(combined.map(a => ({
      id: a.id,
      titleAr: a.titleAr,
      titleEn: a.titleEn,
      views: a.views,
      category: a.category,
      snippetEn: a.contentEn.substring(0, 120) + (a.contentEn.length > 120 ? '...' : ''),
      snippetAr: a.contentAr.substring(0, 120) + (a.contentAr.length > 120 ? '...' : ''),
    })));
  } catch (error) {
    console.error('KB suggest error:', error);
    res.status(500).json({ error: 'Suggestion failed' });
  }
});

export default router;

