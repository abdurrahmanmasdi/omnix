import { ApiProperty } from '@nestjs/swagger';

/** Response of a staff manual send (KI-023, D-021). */
export class ManualMessageResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() conversationId: string;
  @ApiProperty({ type: String, nullable: true }) senderId: string | null;
  @ApiProperty() content: string;
  @ApiProperty({ type: String, nullable: true }) mediaUrl: string | null;
  @ApiProperty() type: string;
  @ApiProperty() handledBy: string;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;

  @ApiProperty({
    enum: ['SENT', 'UNKNOWN', 'FAILED', 'CANCELLED'],
    description: 'SENT, UNKNOWN (check WhatsApp before resending) or FAILED',
  })
  deliveryStatus: string;

  @ApiProperty({
    type: [String],
    description:
      'Non-blocking notices for staff, e.g. PATIENT_OPTED_OUT (the patient sent STOP; the message was still sent). Empty otherwise.',
  })
  warnings: string[];
}
