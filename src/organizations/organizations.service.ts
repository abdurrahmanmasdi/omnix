import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { tenantStorage } from '../core/tenant/tenant.context';
import { provisionOrganizationRolesAndPermissions } from '../auth/permission.provisioning';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(userId: string, dto: CreateOrganizationDto) {
    // First-workspace provisioning has no tenant yet; scope it to a verified user.
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Serialize requests for this user. READ COMMITTED sees the first
            // request's membership after waiting for its row lock to release.
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
              throw new UnauthorizedException('User account is not active');
            }
            const existingMembership =
              await tx.organizationMembership.findFirst({
                where: { userId, status: 'ACTIVE', deletedAt: null },
              });

            if (existingMembership) {
              return {
                organizationId: existingMembership.organizationId,
                roleId: existingMembership.roleId,
              };
            }

            // Ensure slug is unique
            const existingOrg = await tx.organization.findFirst({
              where: { slug: dto.slug },
            });
            if (existingOrg) {
              throw new ConflictException(
                'An organization with this slug already exists',
              );
            }

            // Create the Organization and Persona
            const org = await tx.organization.create({
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

            // Provision standard roles and permissions for the organization
            const roleMap = await provisionOrganizationRolesAndPermissions(
              tx,
              org.id,
            );
            const superAdminRole = roleMap.get('Super Admin');

            if (!superAdminRole)
              throw new Error('Super Admin role not created');

            // Attach the User to the Organization as a Manager/Super Admin
            await tx.organizationMembership.create({
              data: {
                userId: userId,
                organizationId: org.id,
                roleId: superAdminRole.id,
                status: 'ACTIVE',
                agentTier: 'MANAGER',
              },
            });

            return { organizationId: org.id, roleId: superAdminRole.id };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Unique constraint failed (e.g. concurrent slug or user membership insertion)
          throw new ConflictException(
            'Organization creation failed due to a concurrent conflict',
          );
        }
        if (error.code === 'P2034') {
          // Transaction failed due to a write conflict/deadlock, throw conflict so they can retry
          throw new ConflictException(
            'Concurrent request conflict. Please try again.',
          );
        }
        throw error;
      }
    });
  }

  async findById(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
  }
}
