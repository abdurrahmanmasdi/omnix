import re

file = "src/follow-ups/follow-up.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    """this.logger.warn(`Follow-up delivery aborted for media (Org: ${organization.id}, Conv: ${conversationId})`);
            return;""",
    """this.logger.warn(`Follow-up delivery aborted for media (Org: ${organization.id}, Conv: ${conversationId})`);
            await this.recordCancellation(conversationId, organization.id, 'Follow-up aborted prior to media send due to authorization failure.');
            return;"""
)

c = c.replace(
    """this.logger.warn(`Follow-up delivery aborted for text (Org: ${organization.id}, Conv: ${conversationId})`);
              return;""",
    """this.logger.warn(`Follow-up delivery aborted for text (Org: ${organization.id}, Conv: ${conversationId})`);
              await this.recordCancellation(conversationId, organization.id, 'Follow-up aborted prior to text send due to authorization failure.');
              return;"""
)

new_method = """
  private async recordCancellation(conversationId: string, organizationId: string, reason: string) {
    const sysMsg = await this.prisma.message.create({
      data: {
        conversationId,
        content: `[SYSTEM: Follow-up Cancelled] ${reason}`,
        type: 'SYSTEM',
        handledBy: 'SYSTEM',
      },
    });
    this.eventsGateway.broadcastNewMessage(organizationId, sysMsg);
  }

  async process(job: Job) {"""

c = c.replace("async process(job: Job) {", new_method)

with open(file, "w") as f:
    f.write(c)
