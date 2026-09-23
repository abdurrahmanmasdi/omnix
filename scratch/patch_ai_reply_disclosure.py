import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

old_query = """      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { channel: true },
      });"""

new_query = """      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { channel: true, organization: true },
      });"""
c = c.replace(old_query, new_query)

old_check = """      // 3. Request AI generation from Python service
      this.logger.log(`Calling Python Agent Service for Conv: ${conversationId}`);"""

new_check = """      // T15: Send deterministic AI disclosure before the first AI reply
      if (!conversation.aiDisclosureSent && conversation.channel) {
        const disclosureMessage = conversation.organization?.aiDisclosureText || "Hi! I'm an AI assistant. I can help answer your questions. Reply 'human' at any time to speak with a real person.";
        
        try {
          await this.whatsappService.sendTextMessage(
            conversation.channel.credentialId,
            organizationId,
            customerPhone,
            disclosureMessage,
            conversation.channel.providerAccountId
          );

          const sysMsg = await this.prisma.message.create({
            data: {
              conversationId,
              metaMessageId: `disclosure-${Date.now()}`,
              content: disclosureMessage,
              type: 'SYSTEM' as any,
              handledBy: 'SYSTEM' as any,
            }
          });
          this.eventsGateway.broadcastNewMessage(organizationId, sysMsg);

          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { aiDisclosureSent: true }
          });
          this.logger.log(`Sent AI disclosure for conversation ${conversationId}`);
        } catch (error) {
          this.logger.error(`Failed to send AI disclosure for conversation ${conversationId}`, error);
        }
      }

      // 3. Request AI generation from Python service
      this.logger.log(`Calling Python Agent Service for Conv: ${conversationId}`);"""

c = c.replace(old_check, new_check)

with open(file, "w") as f:
    f.write(c)
