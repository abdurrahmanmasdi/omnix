import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

# We need to change where newMessageIds comes from.
# Currently it destructured from job.data:
# const { organizationId, conversationId, customerPhone, newMessageIds, stateVersion } = job.data;
# We want to change it to:
# const { organizationId, conversationId, customerPhone, stateVersion } = job.data;
# const pendingMessages = await this.prisma.message.findMany({ where: { conversationId, handledBy: 'SYSTEM', type: { in: ['CUSTOMER_TEXT', 'IMAGE', 'AUDIO'] } }, orderBy: { createdAt: 'asc' } });
# const newMessageIds = pendingMessages.map(m => m.id);
# if (newMessageIds.length === 0) { this.logger.log("No pending messages to process."); return; }

old_destructure = """      const { organizationId, conversationId, customerPhone, newMessageIds, stateVersion } =
        job.data;"""

new_destructure = """      const { organizationId, conversationId, customerPhone, stateVersion } = job.data;

      const pendingMessages = await this.prisma.message.findMany({
        where: {
          conversationId,
          handledBy: 'SYSTEM',
          type: { in: ['CUSTOMER_TEXT', 'IMAGE', 'AUDIO'] }
        },
        orderBy: { createdAt: 'asc' }
      });
      const newMessageIds = pendingMessages.map((m: any) => m.id);
      if (newMessageIds.length === 0) {
        this.logger.log(`No pending messages for Conv: ${conversationId}`);
        return;
      }"""

c = c.replace(old_destructure, new_destructure)
c = c.replace(
    "const { organizationId, conversationId, customerPhone, newMessageIds } =\n        job.data;",
    new_destructure
)

with open(file, "w") as f:
    f.write(c)
