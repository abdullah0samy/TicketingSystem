import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeamNotesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true, role: true },
    });

    const where: any = { deletedAt: null };
    if (user?.role !== 'super_admin') {
      if (!user?.departmentId) return [];
      where.departmentId = user.departmentId;
    }

    return this.prisma.teamNote.findMany({
      where,
      include: {
        author: { select: { id: true, fullNameAr: true, fullNameEn: true, avatarUrl: true } },
        attachments: true,
        comments: {
          include: { author: { select: { id: true, fullNameAr: true, fullNameEn: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
        likes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: number, body: { body?: string; attachments?: any[] }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true, role: true },
    });

    if (!user?.departmentId && user?.role !== 'super_admin') {
      throw new BadRequestException('User not assigned to a department');
    }

    return this.prisma.teamNote.create({
      data: {
        body: body.body,
        authorId: userId,
        departmentId: user?.departmentId || null,
        attachments: body.attachments?.length
          ? { create: body.attachments.map((a: any) => ({
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
              isVoiceNote: a.isVoiceNote || false,
              voiceDuration: a.voiceDuration,
            })) }
          : undefined,
      },
      include: { author: true, attachments: true, comments: true, likes: true },
    });
  }

  async addComment(userId: number, noteId: number, body: { body?: string }) {
    return this.prisma.teamNoteComment.create({
      data: { body: body.body, authorId: userId, noteId },
      include: {
        author: { select: { id: true, fullNameAr: true, fullNameEn: true, avatarUrl: true } },
      },
    });
  }

  async toggleLike(userId: number, noteId: number) {
    const existingLike = await this.prisma.teamNoteLike.findUnique({
      where: { noteId_userId: { noteId, userId } },
    });

    if (existingLike) {
      await this.prisma.teamNoteLike.delete({ where: { id: existingLike.id } });
      return { liked: false };
    }

    await this.prisma.teamNoteLike.create({ data: { noteId, userId } });
    return { liked: true };
  }

  async remove(userId: number, userRole: string, noteId: number) {
    const note = await this.prisma.teamNote.findUnique({ where: { id: noteId } });
    if (!note || note.deletedAt) {
      throw new (await import('@nestjs/common').then(m => m.NotFoundException))('Team note not found');
    }
    if (note.authorId !== userId && userRole !== 'super_admin') {
      throw new (await import('@nestjs/common').then(m => m.ForbiddenException))('Only the author or a super admin can delete this note');
    }
    await this.prisma.teamNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
  }
}
