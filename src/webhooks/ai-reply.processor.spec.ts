import { HttpException, HttpStatus } from '@nestjs/common';
import { AiReplyProcessor } from './ai-reply.processor';

// WP-A A8 (KI-054): when the Python RPC fails (e.g. NOT_FOUND for a missing
// conversation), the job fails, the inbound batch stays PENDING and nothing
// is created or sent to the patient.
describe('AiReplyProcessor on AI RPC failure', () => {
  it('sends nothing to the patient and leaves the batch pending', async () => {
    const prisma = {
      message: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      conversation: { update: jest.fn(), findUnique: jest.fn() },
    };
    const inboundClaims = {
      claim: jest.fn().mockResolvedValue({
        owner: 'owner-a8',
        organization: { id: 'org-a8', aiPersona: null },
        conversation: {
          id: 'conv-a8',
          stateVersion: 1,
          aiDisclosureSent: true,
          lead: null,
        },
        channel: null,
        messageIds: ['msg-a8'],
      }),
      heartbeat: jest.fn().mockResolvedValue(true),
      owns: jest.fn().mockResolvedValue(true),
      finish: jest.fn().mockResolvedValue(undefined),
      releaseConversation: jest.fn().mockResolvedValue(undefined),
    };
    const outboundAttempts = { sendBubble: jest.fn() };
    const whatsapp = {
      sendTypingIndicator: jest.fn(),
      sendTextMessage: jest.fn(),
    };
    const actionExecutor = { executeActions: jest.fn() };
    const grpcClient = {
      generateReply: jest
        .fn()
        .mockRejectedValue(
          new HttpException(
            'Downstream service failed',
            HttpStatus.BAD_GATEWAY,
          ),
        ),
    };
    // Partial fakes for the constructor dependencies, typed in one place.
    const deps = [
      prisma,
      whatsapp,
      { broadcastNewMessage: jest.fn() },
      actionExecutor,
      { scheduleAutoFollowUps: jest.fn() },
      { record: jest.fn() },
      { authorizeDelivery: jest.fn().mockResolvedValue(true) },
      inboundClaims,
      outboundAttempts,
      grpcClient,
    ] as unknown as ConstructorParameters<typeof AiReplyProcessor>;
    const processor = new AiReplyProcessor(...deps);
    const job = {
      data: {
        organizationId: 'org-a8',
        conversationId: 'conv-a8',
        newMessageIds: ['msg-a8'],
      },
    } as unknown as Parameters<AiReplyProcessor['process']>[0];

    await expect(processor.process(job)).rejects.toThrow(
      'Downstream service failed',
    );

    expect(grpcClient.generateReply).toHaveBeenCalledTimes(1);
    expect(prisma.message.createMany).not.toHaveBeenCalled();
    expect(outboundAttempts.sendBubble).not.toHaveBeenCalled();
    expect(whatsapp.sendTextMessage).not.toHaveBeenCalled();
    expect(actionExecutor.executeActions).not.toHaveBeenCalled();
    expect(inboundClaims.finish).toHaveBeenCalledWith(
      'conv-a8',
      'owner-a8',
      ['msg-a8'],
      'PENDING',
    );
    expect(inboundClaims.finish).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'PROCESSED',
    );
  });
});
