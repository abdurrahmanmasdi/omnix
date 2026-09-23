import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

# Replace the messy new_create from fix_webhooks.py
old_create_block = """              let updatedConv;
              let outboxEvent;
              try {
                // T14: Create message, increment stateVersion, and create scheduling outbox event atomically
                const result = await this.prisma.$transaction([
                  this.prisma.message.create({
                    data: {
                      conversationId: conversation.id,
                      metaMessageId: metaMessageId,
                      content: messageContent,
                      mediaUrl: mediaUrl,
                      type: 'LEAD_TEXT', // Keep original type
                      handledBy: 'SYSTEM', // Wait, handledBy should be SYSTEM if AI is supposed to reply? Let's use SYSTEM so AI can find it.
                    },
                  }),
                  this.prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { status: 'ACTIVE', updatedAt: new Date(), stateVersion: { increment: 1 } },
                  }),
                  this.prisma.outboxEvent.create({
                    data: {
                      topic: 'generate-reply',
                      organizationId: organization.id,
                      payload: {}, // Will update with stateVersion
                      status: 'PENDING',
                    },
                  })
                ]);
                wpMessage = result[0];
                updatedConv = result[1];
                outboxEvent = result[2];

                // Update payload with new stateVersion
                await this.prisma.outboxEvent.update({
                  where: { id: outboxEvent.id },
                  data: {
                    payload: {
                      organizationId: organization.id,
                      conversationId: conversation.id,
                      customerPhone: customerPhone,
                      stateVersion: updatedConv.stateVersion,
                    }
                  }
                });
              } catch (error: any) {
                if (error?.code === 'P2002') {
                  this.logger.warn(`Duplicate inbound message ${metaMessageId} rejected atomically.`);
                  continue;
                }
                throw error;
              }"""

new_create_block = """              try {
                // T14: Create message, increment stateVersion, and create scheduling outbox event atomically
                const result = await this.prisma.$transaction(async (tx) => {
                  const msg = await tx.message.create({
                    data: {
                      conversationId: conversation.id,
                      metaMessageId: metaMessageId,
                      content: messageContent,
                      mediaUrl: mediaUrl,
                      type: 'LEAD_TEXT',
                      handledBy: 'HUMAN',
                    },
                  });
                  const updConv = await tx.conversation.update({
                    where: { id: conversation.id },
                    data: { status: 'ACTIVE', updatedAt: new Date(), stateVersion: { increment: 1 } },
                  });
                  await tx.outboxEvent.create({
                    data: {
                      topic: 'generate-reply',
                      organizationId: organization.id,
                      status: 'PENDING',
                      payload: {
                        organizationId: organization.id,
                        conversationId: conversation.id,
                        customerPhone: customerPhone,
                        messageId: msg.id,
                        stateVersion: updConv.stateVersion,
                      }
                    },
                  });
                  return msg;
                });
                wpMessage = result;
              } catch (error: any) {
                if (error?.code === 'P2002') {
                  this.logger.warn(`Duplicate inbound message ${metaMessageId} rejected atomically.`);
                  continue;
                }
                throw error;
              }"""

c = c.replace(old_create_block, new_create_block)

old_ai_dispatch = """              if (channel) {
                const jobId = `reply-${conversation.id}`; // Unique ID for this conversation

                // We use optimistic immediate dispatch. The Outbox processor handles fallback.
                try {
                  await this.aiReplyQueue.add(
                    'generate-reply',
                    {
                      organizationId: organization.id,
                      conversationId: conversation.id,
                      customerPhone: customerPhone,
                      stateVersion: updatedConv.stateVersion,
                    },
                    {
                      jobId: `reply-${conversation.id}-${updatedConv.stateVersion}`,
                      delay: 7000,
                      removeOnComplete: true,
                    },
                  );
                  // Optimistically mark as PROCESSED so outbox cron doesn't double schedule
                  await this.prisma.outboxEvent.update({
                    where: { id: outboxEvent.id },
                    data: { status: 'PROCESSED', processedAt: new Date() }
                  });
                } catch (err) {
                  this.logger.error(`Immediate dispatch failed for outbox event ${outboxEvent.id}, fallback to cron`, err);
                }
              }"""

new_ai_dispatch = """              if (!channel) {
                this.logger.warn(
                  `Organization ${organization.id} is missing outbound WhatsApp credentials. Auto-reply skipped.`,
                );
              }"""

c = c.replace(old_ai_dispatch, new_ai_dispatch)

with open(file, "w") as f:
    f.write(c)
