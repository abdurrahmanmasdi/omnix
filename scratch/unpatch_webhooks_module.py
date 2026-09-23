import re

file = "src/webhooks/webhooks.module.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "import { DeliveryAuthService } from './delivery-auth.service';\nimport { OutboxRelayProcessor } from './outbox-relay.processor';",
    "import { DeliveryAuthService } from './delivery-auth.service';"
)
c = c.replace(
    "providers: [\n    WebhooksProcessor,\n    AiReplyProcessor,\n    OutboxRelayProcessor,",
    "providers: [\n    WebhooksProcessor,\n    AiReplyProcessor,"
)

with open(file, "w") as f:
    f.write(c)
