import re

file = "src/follow-ups/follow-up.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace("conversationId)", "conversation.id)")
c = c.replace("conversationId})", "conversation.id})")
c = c.replace("${conversationId}", "${conversation.id}")

if "import { DeliveryAuthService }" not in c:
    c = c.replace(
        "import { FollowUpService } from './follow-up.service';",
        "import { FollowUpService } from './follow-up.service';\nimport { DeliveryAuthService } from '../webhooks/delivery-auth.service';"
    )

with open(file, "w") as f:
    f.write(c)
