import re

file = "src/follow-ups/follow-up.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "import { FollowUpService } from './follow-up.service';", 
    "import { FollowUpService } from './follow-up.service';\nimport { DeliveryAuthService } from '../webhooks/delivery-auth.service';"
)

c = c.replace(
    "private readonly auditService: AuditService,",
    "private readonly auditService: AuditService,\n    private readonly deliveryAuth: DeliveryAuthService,"
)

media_call = """const mediaResponse = await this.whatsappService.sendMediaMessage("""
new_media = """
          const authOk = await this.deliveryAuth.authorizeDelivery(organization.id, conversationId);
          if (!authOk) {
            this.logger.warn(`Follow-up delivery aborted for media (Org: ${organization.id}, Conv: ${conversationId})`);
            return;
          }
          const mediaResponse = await this.whatsappService.sendMediaMessage("""
c = c.replace(media_call, new_media)

text_call = """const metaResponse = await this.whatsappService.sendTextMessage("""
new_text = """
            const authOk = await this.deliveryAuth.authorizeDelivery(organization.id, conversationId);
            if (!authOk) {
              this.logger.warn(`Follow-up delivery aborted for text (Org: ${organization.id}, Conv: ${conversationId})`);
              return;
            }
            const metaResponse = await this.whatsappService.sendTextMessage("""
c = c.replace(text_call, new_text)

with open(file, "w") as f:
    f.write(c)
