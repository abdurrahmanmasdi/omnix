import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

# Destructure stateVersion
old_destructure = """    const {
      organizationId,
      conversationId,
      customerPhone,
      newMessageIds,
    } = job.data;"""

new_destructure = """    const {
      organizationId,
      conversationId,
      customerPhone,
      newMessageIds,
      stateVersion,
    } = job.data;"""

c = c.replace(old_destructure, new_destructure)

# Pass it to authorizeDelivery
c = c.replace(
    "const authOk = await this.deliveryAuth.authorizeDelivery(organizationId, conversationId);",
    "const authOk = await this.deliveryAuth.authorizeDelivery(organizationId, conversationId, stateVersion);"
)

# And if auth fails, write the SYSTEM message
c = c.replace(
    """this.logger.warn(`Delivery aborted for disclosure (Org: ${organizationId}, Conv: ${conversationId})`);
            return;""",
    """this.logger.warn(`Delivery aborted for disclosure (Org: ${organizationId}, Conv: ${conversationId})`);
            await this.recordCancellation(conversationId, organizationId, 'Delivery aborted prior to disclosure send due to authorization failure or version mismatch.');
            return;"""
)

c = c.replace(
    """this.logger.warn(`Delivery aborted for media (Org: ${organizationId}, Conv: ${conversationId})`);
            return;""",
    """this.logger.warn(`Delivery aborted for media (Org: ${organizationId}, Conv: ${conversationId})`);
            await this.recordCancellation(conversationId, organizationId, 'Delivery aborted prior to media send due to authorization failure or version mismatch.');
            return;"""
)

c = c.replace(
    """this.logger.warn(`Delivery aborted for text bubble ${i} (Org: ${organizationId}, Conv: ${conversationId})`);
              return;""",
    """this.logger.warn(`Delivery aborted for text bubble ${i} (Org: ${organizationId}, Conv: ${conversationId})`);
              await this.recordCancellation(conversationId, organizationId, 'Delivery aborted prior to text send due to authorization failure or version mismatch.');
              return;"""
)

# Add the recordCancellation method
new_method = """
  private async recordCancellation(conversationId: string, organizationId: string, reason: string) {
    const aiMessage = await this.prisma.message.create({
      data: {
        conversationId,
        content: `[SYSTEM: Generation Cancelled] ${reason}`,
        type: 'SYSTEM',
        handledBy: 'SYSTEM',
      },
    });
    this.eventsGateway.broadcastNewMessage(organizationId, aiMessage);
  }

  async process(job: Job) {"""

c = c.replace("async process(job: Job) {", new_method)

with open(file, "w") as f:
    f.write(c)
