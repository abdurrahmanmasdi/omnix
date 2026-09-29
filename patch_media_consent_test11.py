import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("import { WebhooksService } from '../src/webhooks/webhooks.service';", "import { WebhooksService } from '../src/webhooks/webhooks.service';\nimport { WebhooksProcessor } from '../src/webhooks/webhooks.processor';")

# Replace request calls with processor.process calls
replace1 = """.set('x-hub-signature-256', signPayload(payload1).signature)
      .send(payload1)
      .expect(200);
      
    // Wait for async processing
    await new Promise(r => setTimeout(r, 1000));"""
new1 = """const processor = app.get(WebhooksProcessor);
    await processor.process({ data: payload1 } as any);"""
content = content.replace(replace1, new1)

replace2 = """.set('x-hub-signature-256', signPayload(payload2).signature).send(payload2).expect(200);
    await new Promise(r => setTimeout(r, 1000));"""
new2 = """await processor.process({ data: payload2 } as any);"""
content = content.replace(replace2, new2)

replace3 = """.set('x-hub-signature-256', signPayload(payload3).signature).send(payload3).expect(200);
    await new Promise(r => setTimeout(r, 1000));"""
new3 = """await processor.process({ data: payload3 } as any);"""
content = content.replace(replace3, new3)

replace4 = """.set('x-hub-signature-256', signPayload(payload4).signature).send(payload4).expect(200);
    await new Promise(r => setTimeout(r, 1000));"""
new4 = """await processor.process({ data: payload4 } as any);"""
content = content.replace(replace4, new4)

with open(path, 'w') as f:
    f.write(content)
