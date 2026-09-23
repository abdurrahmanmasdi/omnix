file = "src/webhooks/webhooks.module.ts"
with open(file, "r") as f:
    c = f.read()

import_line = "import { NotificationEmitterService } from '../notifications/notification-emitter.service';"
c = c.replace(import_line, import_line + "\nimport { DeliveryAuthService } from './delivery-auth.service';")

providers_line = "ActionExecutorService,"
c = c.replace(providers_line, providers_line + "\n    DeliveryAuthService,")
c = c.replace("exports: [WhatsappService,", "exports: [WhatsappService, DeliveryAuthService,")

with open(file, "w") as f:
    f.write(c)
