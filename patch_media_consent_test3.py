import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("               timezone: 'UTC',\n               officeHours: {},", "")

with open(path, 'w') as f:
    f.write(content)
