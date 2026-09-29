import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

req1 = """.set('Content-Type', 'application/json').set('x-hub-signature-256', signPayload(payload1).signature)
      .send(signPayload(payload1).body)
      .expect(200);"""
new_req1 = """.set('x-hub-signature-256', signPayload(payload1).signature)
      .send(payload1)
      .expect(200);"""
content = content.replace(req1, new_req1)

req2 = """.set('x-hub-signature-256', signPayload(payload2).signature).send(signPayload(payload2).body).expect(200);"""
new_req2 = """.set('x-hub-signature-256', signPayload(payload2).signature).send(payload2).expect(200);"""
content = content.replace(req2, new_req2)

req3 = """.set('x-hub-signature-256', signPayload(payload3).signature).send(signPayload(payload3).body).expect(200);"""
new_req3 = """.set('x-hub-signature-256', signPayload(payload3).signature).send(payload3).expect(200);"""
content = content.replace(req3, new_req3)

req4 = """.set('x-hub-signature-256', signPayload(payload4).signature).send(signPayload(payload4).body).expect(200);"""
new_req4 = """.set('x-hub-signature-256', signPayload(payload4).signature).send(payload4).expect(200);"""
content = content.replace(req4, new_req4)

with open(path, 'w') as f:
    f.write(content)
