import re

file = "src/core/outbox/outbox.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "@InjectQueue('outbox-relay') private readonly outboxRelayQueue: Queue,",
    "@InjectQueue('outbox-relay') private readonly outboxRelayQueue: Queue,\n    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,"
)

c = c.replace(
    "await this.outboxRelayQueue.add('generate-reply', {",
    "await this.aiReplyQueue.add('generate-reply', {"
)

with open(file, "w") as f:
    f.write(c)
