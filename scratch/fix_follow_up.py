import re

file = "src/follow-ups/follow-up.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "import { TenantStorage } from '../core/tenant/tenant.context';",
    "import { TenantStorage } from '../core/tenant/tenant.context';\nimport { DeliveryAuthService } from '../webhooks/delivery-auth.service';"
)

with open(file, "w") as f:
    f.write(c)
