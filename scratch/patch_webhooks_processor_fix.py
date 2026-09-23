import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace("conversation = result;", "conversation = result || null;")

with open(file, "w") as f:
    f.write(c)
