import { describe, it, expect } from 'vitest';
import { createTicketSchema, ticketSearchSchema } from '../../src/common/schemas/tickets.schema.ts';

describe('Ticket Validation Schemas', () => {
  describe('createTicketSchema', () => {
    it('should accept a valid ticket with all required fields', async () => {
      const validTicket = {
        description: 'Printer is not working',
        departmentId: '3',
      };
      const result = await createTicketSchema.parseAsync(validTicket);
      expect(result.description).toBe('Printer is not working');
      expect(result.departmentId).toBe(3); // transformed to number
      expect(result.subject).toBe('No Subject'); // default
      expect(result.priority).toBe('normal'); // default
    });

    it('should reject missing description', async () => {
      const invalid = { departmentId: '3' };
      await expect(createTicketSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should reject description shorter than 5 characters', async () => {
      const invalid = { description: 'Hi', departmentId: '3' };
      await expect(createTicketSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should reject missing departmentId', async () => {
      const invalid = { description: 'Valid description text' };
      await expect(createTicketSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should accept departmentId as a number or numeric string', async () => {
      const withNumber = { description: 'Some issue here', departmentId: 5 };
      const withString = { description: 'Some issue here', departmentId: '5' };
      
      const r1 = await createTicketSchema.parseAsync(withNumber);
      const r2 = await createTicketSchema.parseAsync(withString);
      expect(r1.departmentId).toBe(5);
      expect(r2.departmentId).toBe(5);
    });

    it('should reject non-numeric departmentId string', async () => {
      const invalid = { description: 'Some issue here', departmentId: 'abc' };
      await expect(createTicketSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should validate priority enum values', async () => {
      const valid = { description: 'Some issue here', departmentId: '1', priority: 'critical' };
      const result = await createTicketSchema.parseAsync(valid);
      expect(result.priority).toBe('critical');

      const invalid = { description: 'Some issue here', departmentId: '1', priority: 'urgent' };
      await expect(createTicketSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should accept optional nullable fields', async () => {
      const ticket = {
        description: 'Some issue here',
        departmentId: '1',
        ticketTypeId: null,
        buildingId: null,
        floorId: null,
        assetId: null,
        roomExtension: null,
      };
      const result = await createTicketSchema.parseAsync(ticket);
      expect(result.ticketTypeId).toBeNull();
      expect(result.buildingId).toBeNull();
    });

    it('should validate attachments array structure', async () => {
      const ticket = {
        description: 'Some issue here',
        departmentId: '1',
        attachments: [
          {
            fileName: 'test.pdf',
            fileUrl: '/uploads/test.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
          },
        ],
      };
      const result = await createTicketSchema.parseAsync(ticket);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments![0].fileName).toBe('test.pdf');
    });

    it('should reject attachments with missing fields', async () => {
      const ticket = {
        description: 'Some issue here',
        departmentId: '1',
        attachments: [{ fileName: 'test.pdf' }], // missing fileUrl, fileSize, mimeType
      };
      await expect(createTicketSchema.parseAsync(ticket)).rejects.toThrow();
    });

    it('should reject subject longer than 200 characters', async () => {
      const ticket = {
        subject: 'x'.repeat(201),
        description: 'Some issue here',
        departmentId: '1',
      };
      await expect(createTicketSchema.parseAsync(ticket)).rejects.toThrow();
    });

    it('should default subject to No Subject when empty string', async () => {
      const result = await createTicketSchema.parseAsync({
        subject: '',
        description: 'Some issue here',
        departmentId: '1',
      });
      expect(result.subject).toBe('No Subject');
    });
  });

  describe('ticketSearchSchema', () => {
    it('should accept valid search query', async () => {
      const valid = { q: 'printer issue' };
      const result = await ticketSearchSchema.parseAsync(valid);
      expect(result.q).toBe('printer issue');
    });

    it('should reject query shorter than 2 characters', async () => {
      const invalid = { q: 'x' };
      await expect(ticketSearchSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should reject query longer than 100 characters', async () => {
      const invalid = { q: 'x'.repeat(101) };
      await expect(ticketSearchSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should reject missing query', async () => {
      const invalid = {};
      await expect(ticketSearchSchema.parseAsync(invalid)).rejects.toThrow();
    });

    it('should parse page and limit as numbers from strings', async () => {
      const valid = { q: 'test query', page: '3', limit: '50' };
      const result = await ticketSearchSchema.parseAsync(valid);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(50);
    });
  });
});
