import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

# Mock ConfigService or just generate a signature
content = content.replace("process.env.DATABASE_URL = url.toString();", "process.env.DATABASE_URL = url.toString();\n    process.env.META_APP_SECRET = 'test-secret';")

setup = """  beforeAll(async () => {"""
new_setup = """import { createHmac } from 'crypto';

function signPayload(payload: any) {
  const body = Buffer.from(JSON.stringify(payload));
  const signature = 'sha256=' + createHmac('sha256', 'test-secret').update(body).digest('hex');
  return { body, signature };
}

  beforeAll(async () => {"""
content = content.replace(setup, new_setup)

# Update request calls
req1 = """.send(payload1)
      .expect(201);"""
new_req1 = """.set('x-hub-signature-256', signPayload(payload1).signature)
      .send(signPayload(payload1).body)
      .expect(200);"""
content = content.replace(req1, new_req1)

req2 = """.send(payload2).expect(201);"""
new_req2 = """.set('x-hub-signature-256', signPayload(payload2).signature).send(signPayload(payload2).body).expect(200);"""
content = content.replace(req2, new_req2)

req3 = """.send(payload3).expect(201);"""
new_req3 = """.set('x-hub-signature-256', signPayload(payload3).signature).send(signPayload(payload3).body).expect(200);"""
content = content.replace(req3, new_req3)

req4 = """.send(payload4).expect(201);"""
new_req4 = """.set('x-hub-signature-256', signPayload(payload4).signature).send(signPayload(payload4).body).expect(200);"""
content = content.replace(req4, new_req4)

with open(path, 'w') as f:
    f.write(content)
