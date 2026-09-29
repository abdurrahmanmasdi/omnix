import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("id: 'cred-1',", "id: '11111111-1111-1111-1111-111111111111',")
content = content.replace("credentialId: 'cred-1',", "credentialId: '11111111-1111-1111-1111-111111111111',")
content = content.replace("id: 'channel-1',", "id: '22222222-2222-2222-2222-222222222222',")

with open(path, 'w') as f:
    f.write(content)
