import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, org: CreateOrganizationDto) {
    // This single query creates the Organization AND the Member link simultaneously
    return this.prisma.organization.create({
      data: {
        ...org,
        members: {
          create: {
            userId: userId,
            role: 'OWNER', // Automatically make the creator the owner
          },
        },
      },
    });
  }

  async findAllForUser(userId: string) {
    const organizations = await this.prisma.organization.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        members: {
          select: {
            role: true,
            userId: true, // We need this to check who the current user is
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });

    // 2. Sanitize the data: strip the members array if the user isn't the OWNER
    return organizations.map((org) => {
      // Find the requesting user's specific role in this current organization loop
      const myMembership = org.members.find((m) => m.userId === userId);

      // If they are the OWNER, return the entire organization object intact
      if (myMembership?.role === 'OWNER') {
        return org;
      }

      // If they are NOT the OWNER, use destructuring to separate 'members' from the rest of the data
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { members, ...sanitizedOrg } = org;

      // Return the organization WITHOUT the members array
      return sanitizedOrg;
    });
  }
}
