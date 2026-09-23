import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

record_cancellation_fn = """
  private async recordCancellation(conversationId: string, organizationId: string, reason: string) {
    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        metaMessageId: `cancel-${Date.now()}`,
        content: `[SYSTEM: Generation Cancelled] ${reason}`,
        type: 'SYSTEM_TEXT',
        handledBy: 'SYSTEM'
      }
    });
    this.eventsGateway.broadcastNewMessage(organizationId, msg);
  }

  async process("""

c = c.replace("  async process(", record_cancellation_fn)

with open(file, "w") as f:
    f.write(c)
