import re

file = "src/core/outbox/outbox.module.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "BullModule.registerQueue({\n      name: 'outbox-relay',\n    }),",
    "BullModule.registerQueue({\n      name: 'outbox-relay',\n    }),\n    BullModule.registerQueue({\n      name: 'ai-reply',\n    }),"
)

with open(file, "w") as f:
    f.write(c)
