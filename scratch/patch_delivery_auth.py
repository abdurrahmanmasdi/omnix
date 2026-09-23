import re

file = "src/webhooks/delivery-auth.service.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "batchVersionId?: string",
    "batchVersionId?: number"
)

new_check = """
    if (batchVersionId !== undefined && conversation.stateVersion !== batchVersionId) {
      this.logger.warn(`Delivery blocked: Conversation ${conversationId} state version changed from ${batchVersionId} to ${conversation.stateVersion}`);
      return false;
    }

    return true;"""

c = c.replace(
    "// Checking generation/batch version is complex, let's implement the core rules first.\n    // We could check if a newer inbound message exists that hasn't been processed yet,\n    // but the debounce logic (T14) will handle versioning explicitly.\n\n    return true;",
    new_check
)

with open(file, "w") as f:
    f.write(c)
