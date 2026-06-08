import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ABCH Hospital Help Desk API',
      version: '1.0.0',
      description: 'API documentation for the ABC Hospital Help Desk ticketing system',
    },
    servers: [
      { url: '/api', description: 'API base path' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            ticketNumber: { type: 'string', example: 'TKT-240514-001' },
            subject: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'open', 'in_progress', 'resolved', 'closed'] },
            priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
            departmentId: { type: 'integer' },
            createdById: { type: 'integer' },
            assignedToId: { type: 'integer', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            status: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/modules/**/*.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
