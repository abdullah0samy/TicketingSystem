import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(3).max(200).optional().default('No Subject')),
  description: z.string().min(5),
  departmentId: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]),
  ticketTypeId: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  buildingId: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  floorId: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  assetId: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  roomExtension: z.string().max(50).optional().nullable(),
  creatorPhone: z.string().max(50).optional().nullable(),
  creatorExtension: z.string().max(50).optional().nullable(),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileUrl: z.string(),
    fileSize: z.number(),
    mimeType: z.string(),
    isVoiceNote: z.boolean().optional(),
    voiceDuration: z.number().optional()
  })).optional()
});

export const ticketSearchSchema = z.object({
  q: z.string().min(2).max(100),
  page: z.string().regex(/^\d+$/).transform(Number).optional().default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default(20)
});
