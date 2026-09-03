import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { tenantStorage } from '../core/tenant/tenant.context';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(userId: string, dto: CreateOrganizationDto) {
    // 1. Ensure slug is unique
    const existing = await this.prisma.organization.findFirst({
      where: { slug: dto.slug },
    });
    if (existing)
      throw new ConflictException(
        'An organization with this slug already exists',
      );

    // 2. Create the Organization
    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        industry_category: dto.industry_category,
        aiPersona: {
          create: {
            clinicName: dto.name,
            tone: dto.agentTone || 'Professional and empathetic',
            businessRules: dto.businessRules || {},
          },
        },
      },
    });

    // Wrap the subsequent creations in the new organization's tenant context
    // This allows the Prisma extension ($allOperations) to pass the RLS checks.
    return tenantStorage.run({ organizationId: org.id }, async () => {
      // 3. Create the Default "Super Admin" Role
      const role = await this.prisma.role.create({
        data: {
          name: 'Super Admin',
          is_system: true,
          organizationId: org.id,
        },
      });

      // 4. Attach the User to the Organization as a Manager/Super Admin
      await this.prisma.organizationMembership.create({
        data: {
          userId: userId,
          organizationId: org.id,
          roleId: role.id,
          status: 'ACTIVE',
          agentTier: 'MANAGER',
        },
      });

      return { organizationId: org.id, roleId: role.id };
    });
  }
}
