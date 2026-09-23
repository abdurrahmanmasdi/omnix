import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

# Instead of updatedConv, we just pass conversation.stateVersion + 1, because we just incremented it
# Or we can declare updatedConv outside the block or properly within scope.
# The update happens inside the process() loop, wait, no, it's inside `handleIncomingMessage`.

c = c.replace(
    "stateVersion: updatedConv.stateVersion,",
    "stateVersion: conversation.stateVersion + 1,"
)

with open(file, "w") as f:
    f.write(c)
