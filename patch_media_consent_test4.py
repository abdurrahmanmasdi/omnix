import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("          metaAccessToken: 'test-token',", "          encryptedPayload: 'test-token',\n          status: 'ACTIVE',")

with open(path, 'w') as f:
    f.write(content)
