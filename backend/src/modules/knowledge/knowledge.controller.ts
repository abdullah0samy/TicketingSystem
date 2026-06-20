import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Inject, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@Controller('api/knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(@Inject(KnowledgeService) private readonly knowledgeService: KnowledgeService) {}

  @Get('articles')
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.knowledgeService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search || '',
      categoryId ? parseInt(categoryId) : undefined,
    );
  }

  @Get('categories')
  async findCategories() {
    return this.knowledgeService.findCategories();
  }

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.knowledgeService.search(q || '', page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get('suggest')
  async suggest(@Query('q') q: string) {
    return this.knowledgeService.suggest(q || '');
  }

  @Post('articles')
  @HttpCode(201)
  async create(@CurrentUser() user: any, @Body() body: any) {
    return this.knowledgeService.create(user.id, user.role, user.departmentId || null, body);
  }

  @Put('articles/:id')
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.knowledgeService.update(user.id, parseInt(id), user.role, user.departmentId || null, body);
  }

  @Delete('articles/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    await this.knowledgeService.remove(user.id, parseInt(id), user.role, user.departmentId || null);
  }

  @Post('articles/:id/view')
  @HttpCode(204)
  async incrementView(@Param('id') id: string) {
    await this.knowledgeService.incrementView(parseInt(id));
  }

  @Post('categories')
  @HttpCode(201)
  async createCategory(@CurrentUser() user: any, @Body() body: any) {
    return this.knowledgeService.createCategory(user.id, user.role, user.departmentId || null, body);
  }

  @Put('categories/:id')
  async updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.knowledgeService.updateCategory(user.id, parseInt(id), user.role, user.departmentId || null, body);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async removeCategory(@CurrentUser() user: any, @Param('id') id: string) {
    await this.knowledgeService.removeCategory(user.id, parseInt(id), user.role, user.departmentId || null);
  }
}
