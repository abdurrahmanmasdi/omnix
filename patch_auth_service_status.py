import re

file = "src/auth/auth.service.ts"
with open(file, "r") as f:
    content = f.read()

content = content.replace("isEmailVerified: false,", "status: 'PENDING',")
content = content.replace("data: { isEmailVerified: true },", "data: { status: 'ACTIVE' },")

with open(file, "w") as f:
    f.write(content)

file2 = "src/auth/jwt-user.strategy.ts"
with open(file2, "r") as f:
    content2 = f.read()

content2 = content2.replace("isEmailVerified: user.isEmailVerified,", "status: user.status,")

with open(file2, "w") as f:
    f.write(content2)
