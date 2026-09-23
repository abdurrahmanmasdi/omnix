import re

file = "prisma/schema.prisma"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "aiDisclosureSent  Boolean   @default(false)",
    "aiDisclosureSent  Boolean   @default(false)\n  stateVersion      Int       @default(1)"
)

with open(file, "w") as f:
    f.write(c)
