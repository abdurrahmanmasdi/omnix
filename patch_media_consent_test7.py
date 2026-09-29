import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("import { ActionExecutorService } from '../src/webhooks/action-executor.service';", "import { ActionExecutorService } from '../src/webhooks/action-executor.service';\nimport { WebhooksService } from '../src/webhooks/webhooks.service';")

mock_setup = """    app = moduleFixture.createNestApplication();
    await app.init();"""

new_mock = """    app = moduleFixture.createNestApplication();
    await app.init();
    jest.spyOn(app.get(WebhooksService), 'isValidMetaSignature').mockReturnValue(true);"""

content = content.replace(mock_setup, new_mock)

with open(path, 'w') as f:
    f.write(content)
