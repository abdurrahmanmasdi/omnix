import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

setup_key = """    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 'a').toString('base64');"""
content = content.replace(setup_key, "")

encrypted_payload = """          encryptedPayload: encryptCredential({ metaAccessToken: 'test-token' }, Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, 'base64')),"""
new_encrypted_payload = """          encryptedPayload: encryptCredential({ metaAccessToken: 'test-token' }, Buffer.from(process.env.INTEGRATION_CREDENTIAL_KEY, 'base64')),"""
content = content.replace(encrypted_payload, new_encrypted_payload)

with open(path, 'w') as f:
    f.write(content)
