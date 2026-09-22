import re

file = "backend-v2/prisma/schema.prisma"
with open(file, "r") as f:
    content = f.read()

content = content.replace(
    "email                 String\n",
    "email                 String                   @unique\n"
)
content = content.replace(
    "isEmailVerified       Boolean                  @default(false)",
    "status                UserStatus               @default(PENDING)"
)
# We also need to add UserStatus enum
if "enum UserStatus" not in content:
    content = content + "\n\nenum UserStatus {\n  PENDING\n  ACTIVE\n  SUSPENDED\n}\n"

with open(file, "w") as f:
    f.write(content)
