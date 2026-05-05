import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { GRPC_CONFIG } from '../config/grpc.constants';

@Controller()
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);

  // No @Post() or @Get(). This is purely a gRPC listener!
  @GrpcMethod(GRPC_CONFIG.SERVICES.CRM_TOOLS, 'BookAppointment')
  async bookAppointment(data: { leadId: string; dateTime: string }) {
    this.logger.log(
      `🤖 AI requested to book appointment for Lead ${data.leadId} at ${data.dateTime}`,
    );

    try {
      // TODO: Use Prisma to update the database
      // await this.prisma.appointment.create({ ... })

      return {
        success: true,
        message: 'Appointment booked successfully',
        dataJson: JSON.stringify({
          appointmentId: '12345',
          status: 'CONFIRMED',
        }),
      };
    } catch (error) {
      return { success: false, message: 'Database error', dataJson: '{}' };
    }
  }
}
