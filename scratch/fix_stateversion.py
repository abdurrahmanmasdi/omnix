import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "const { organizationId, conversationId, customerPhone, newMessageIds } =",
    "const { organizationId, conversationId, customerPhone, newMessageIds, stateVersion } ="
)

# And fix the Job data type
c = c.replace(
    "newMessageIds: string[];",
    "newMessageIds: string[];\n      stateVersion?: number;"
)

with open(file, "w") as f:
    f.write(c)
