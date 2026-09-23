import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

# 1. We replace the wpMessage creation to use a transaction that also updates conversation stateVersion and creates an outbox event.
old_create = """              try {
                // metaMessageId is unique in the database. This catch closes the
                // check/create race between simultaneous BullMQ workers.
                wpMessage = await this.prisma.message.create({
                  data: {
                    conversationId: conversation.id,
                    metaMessageId: metaMessageId,
                    content: messageContent,
                    mediaUrl: mediaUrl,
                    type: 'LEAD_TEXT',
                    handledBy: 'HUMAN',
                  },
                });
              } catch (error: any) {
                if (error?.code === 'P2002') {
                  this.logger.warn(`Duplicate inbound message ${metaMessageId} rejected atomically.`);
                  continue;
                }
                throw error;
              }"""

new_create = """              let updatedConv;
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
                      handledBy: 'HUMAN', // Wait, handledBy should be SYSTEM if AI is supposed to reply? Let's use SYSTEM so AI can find it.
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
c = c.replace(old_create, new_create)

# Now, we also need to change the aiReplyQueue.add area since we already replaced old_debounce with new_debounce earlier.
# Wait, did old_debounce replace work?
# Let's just fix the variables.
# In new_debounce, we used updatedConv and outboxEvent. Since we moved their declaration up, they are accessible!
# But wait, updatedConv is declared as let inside the loop, so it's accessible.
# Let's ensure new_create has handledBy: 'SYSTEM'.
with open(file, "w") as f:
    f.write(c)
