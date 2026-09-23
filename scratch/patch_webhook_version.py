import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

# When we create the message, we also increment stateVersion.
# Wait, let's just do it right after creating the message.

old_update = """
            // 4. Update the conversation status
            await this.prisma.conversation.update({
              where: { id: conversation.id },
              data: { status: 'ACTIVE', updatedAt: new Date() },
            });
"""

new_update = """
            // 4. Update the conversation status and stateVersion
            const updatedConv = await this.prisma.conversation.update({
              where: { id: conversation.id },
              data: { status: 'ACTIVE', updatedAt: new Date(), stateVersion: { increment: 1 } },
            });
"""

c = c.replace(old_update, new_update)

old_add = """
                // Add a NEW 25-second timer
                await this.aiReplyQueue.add(
                  'generate-reply',
                  {
                    organizationId: organization.id,
                    conversationId: conversation.id,
                    customerPhone: customerPhone,
                    newMessageIds: newMessageIds, // 🚀 NEW: Pass the array of IDs instead of inline media/text
                  },"""

new_add = """
                // Add a NEW 25-second timer
                await this.aiReplyQueue.add(
                  'generate-reply',
                  {
                    organizationId: organization.id,
                    conversationId: conversation.id,
                    customerPhone: customerPhone,
                    newMessageIds: newMessageIds, // 🚀 NEW: Pass the array of IDs instead of inline media/text
                    stateVersion: updatedConv.stateVersion, // T13: Pass the version to check immediately before sending
                  },"""

c = c.replace(old_add, new_add)

with open(file, "w") as f:
    f.write(c)
