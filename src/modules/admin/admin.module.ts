import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminBuildingsController } from './controllers/admin-buildings.controller';
import { AdminFloorsController } from './controllers/admin-floors.controller';
import { AdminDepartmentsController } from './controllers/admin-departments.controller';
import { AdminTicketTypesController } from './controllers/admin-ticket-types.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminRolesController } from './controllers/admin-roles.controller';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [PrismaModule],
  controllers: [
    AdminBuildingsController,
    AdminFloorsController,
    AdminDepartmentsController,
    AdminTicketTypesController,
    AdminUsersController,
    AdminRolesController,
  ],
  providers: [RolesGuard],
})
export class AdminModule {}
