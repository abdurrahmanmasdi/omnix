import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("import { ActionExecutorService } from '../src/webhooks/action-executor.service';", "import { ActionExecutorService } from '../src/webhooks/action-executor.service';\nimport { encryptCredential } from '../src/credentials/credential-cipher';")

setup_key = """    process.env.META_APP_SECRET = 'test-secret';
    
    await safeDeploy(root);"""

new_setup_key = """    process.env.META_APP_SECRET = 'test-secret';
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 'a').toString('base64');
    
    await safeDeploy(root);"""

content = content.replace(setup_key, new_setup_key)

encrypted_payload = """          encryptedPayload: 'test-token',"""
new_encrypted_payload = """          encryptedPayload: encryptCredential({ metaAccessToken: 'test-token' }, Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, 'base64')),"""
content = content.replace(encrypted_payload, new_encrypted_payload)

with open(path, 'w') as f:
    f.write(content)
