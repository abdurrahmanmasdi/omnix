import re

file = "src/follow-ups/follow-up.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "private readonly notificationEmitter: NotificationEmitterService,",
    "private readonly notificationEmitter: NotificationEmitterService,\n    private readonly deliveryAuth: DeliveryAuthService,"
)

with open(file, "w") as f:
    f.write(c)
