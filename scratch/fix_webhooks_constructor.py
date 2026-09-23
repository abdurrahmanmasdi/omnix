import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "@InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,",
    "@InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,\n    private readonly actionExecutor: ActionExecutorService,"
)

with open(file, "w") as f:
    f.write(c)
