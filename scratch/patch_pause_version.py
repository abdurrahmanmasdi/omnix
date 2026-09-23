import re

file = "src/conversations/conversations.service.ts"
with open(file, "r") as f:
    c = f.read()

old_update = """    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiPaused: !conversation.aiPaused },
      include: {
        lead: true,
      },
    });"""

new_update = """    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { aiPaused: !conversation.aiPaused, stateVersion: { increment: 1 } },
      include: {
        lead: true,
      },
    });"""

c = c.replace(old_update, new_update)

with open(file, "w") as f:
    f.write(c)
