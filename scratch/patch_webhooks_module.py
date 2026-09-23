import re

file = "src/webhooks/webhooks.module.ts"
with open(file, "r") as f:
    c = f.read()

if "OutboxRelayProcessor" not in c:
    c = c.replace(
        "import { DeliveryAuthService } from './delivery-auth.service';",
        "import { DeliveryAuthService } from './delivery-auth.service';\nimport { OutboxRelayProcessor } from './outbox-relay.processor';"
    )
    c = c.replace(
        "providers: [\n    WebhooksProcessor,\n    AiReplyProcessor,",
        "providers: [\n    WebhooksProcessor,\n    AiReplyProcessor,\n    OutboxRelayProcessor,"
    )

with open(file, "w") as f:
    f.write(c)
