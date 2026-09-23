import re

# Patch action-executor.service.ts
file = "src/webhooks/action-executor.service.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "data: { aiPaused: true },",
    "data: { aiPaused: true, stateVersion: { increment: 1 } },"
)

with open(file, "w") as f:
    f.write(c)


# Patch webhooks.processor.ts
file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "this.prisma.conversation.update({ where: { id: conversation.id }, data: { aiPaused: true } }),",
    "this.prisma.conversation.update({ where: { id: conversation.id }, data: { aiPaused: true, stateVersion: { increment: 1 } } }),"
)

with open(file, "w") as f:
    f.write(c)

