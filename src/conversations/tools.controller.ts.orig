import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { LeadStatus, NotificationType } from '@prisma/client';
import { GRPC_CONFIG } from '../config/grpc.constants';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';

@Controller()
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);

  constructor(private readonly prisma: PrismaService) {}

  // No @Post() or @Get(). This is purely a gRPC listener!
  @GrpcMethod(GRPC_CONFIG.SERVICES.CRM_TOOLS, 'BookAppointment')
  async bookAppointment(data: { leadId: string; dateTime: string }) {
    this.logger.log(
      `🤖 AI requested to book appointment for Lead ${data.leadId} at ${data.dateTime}`,
    );

    return tenantStorage.run({ isSystemBypass: true }, async () => {
      try {
        const requestedAt = new Date(data.dateTime);
        if (isNaN(requestedAt.getTime())) {
          return {
            success: false,
            message: 'Invalid dateTime format',
            dataJson: '{}',
          };
        }

        const lead = await this.prisma.lead.findUnique({
          where: { id: data.leadId },
        });

        if (!lead) {
          return {
            success: false,
            message: `Lead ${data.leadId} not found`,
            dataJson: '{}',
          };
        }

        // Persist the appointment request on the lead
        await this.prisma.lead.update({
          where: { id: data.leadId },
          data: {
            expectedServiceDate: requestedAt,
            status: LeadStatus.READY_TO_BOOK,
          },
        });

        // Notify the assigned coordinator, or fall back to the first active org member
        const membership = lead.assignedAgentId
          ? await this.prisma.organizationMembership.findFirst({
              where: {
                organizationId: lead.organizationId,
                userId: lead.assignedAgentId,
                status: 'ACTIVE',
              },
              select: { userId: true },
            })
          : null;

        const coordinatorId =
          membership?.userId ||
          (
            await this.prisma.organizationMembership.findFirst({
              where: { organizationId: lead.organizationId, status: 'ACTIVE' },
              select: { userId: true },
              orderBy: { createdAt: 'asc' },
            })
          )?.userId;

        const appointmentId = randomUUID();

        if (coordinatorId) {
          await this.prisma.notification.create({
            data: {
              organizationId: lead.organizationId,
              userId: coordinatorId,
              type: NotificationType.SYSTEM_ALERT,
              title: 'New appointment request',
              body: `Lead ${lead.firstName} ${lead.lastName} requested an appointment on ${requestedAt.toISOString()}. Please confirm.`,
              referenceId: lead.id,
              referenceType: 'LEAD',
            },
          });
        } else {
          this.logger.warn(
            `No active coordinator found for lead ${data.leadId}`,
          );
        }

        return {
          success: true,
          message:
            'Appointment request received. A coordinator will confirm shortly.',
          dataJson: JSON.stringify({
            appointmentId,
            status: 'PENDING_CONFIRMATION',
            requestedAt: requestedAt.toISOString(),
          }),
        };
      } catch (error) {
        this.logger.error('BookAppointment failed', error);
        return { success: false, message: 'Database error', dataJson: '{}' };
      }
    });
  }
}
