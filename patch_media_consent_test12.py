import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("await request(app.getHttpServer())\n      .post('/webhooks/whatsapp')\n      const processor = app.get(WebhooksProcessor);\n    await processor.process({ data: payload1 } as any);", "const processor = app.get(WebhooksProcessor);\n    await processor.process({ data: payload1 } as any);")

content = content.replace("await request(app.getHttpServer()).post('/webhooks/whatsapp')await processor.process({ data: payload2 } as any);", "await processor.process({ data: payload2 } as any);")
content = content.replace("await request(app.getHttpServer()).post('/webhooks/whatsapp')await processor.process({ data: payload3 } as any);", "await processor.process({ data: payload3 } as any);")
content = content.replace("await request(app.getHttpServer()).post('/webhooks/whatsapp')await processor.process({ data: payload4 } as any);", "await processor.process({ data: payload4 } as any);")


with open(path, 'w') as f:
    f.write(content)
