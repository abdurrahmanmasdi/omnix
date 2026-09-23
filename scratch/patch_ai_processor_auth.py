import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

c = c.replace(
    "import { ActionExecutorService } from './action-executor.service';", 
    "import { ActionExecutorService } from './action-executor.service';\nimport { DeliveryAuthService } from './delivery-auth.service';"
)

c = c.replace(
    "private readonly auditService: AuditService,",
    "private readonly auditService: AuditService,\n    private readonly deliveryAuth: DeliveryAuthService,"
)

# Insert auth checks before sending messages
# First, the disclosure check
disclosure_call = """const disclosureResponse = await this.whatsappService.sendTextMessage("""
new_disclosure = """
          const authOk = await this.deliveryAuth.authorizeDelivery(organizationId, conversationId);
          if (!authOk) {
            this.logger.warn(`Delivery aborted for disclosure (Org: ${organizationId}, Conv: ${conversationId})`);
            return;
          }
          const disclosureResponse = await this.whatsappService.sendTextMessage("""
c = c.replace(disclosure_call, new_disclosure)

# Then the media check
media_call = """const mediaResponse = await this.whatsappService.sendMediaMessage("""
new_media = """
          const authOk = await this.deliveryAuth.authorizeDelivery(organizationId, conversationId);
          if (!authOk) {
            this.logger.warn(`Delivery aborted for media (Org: ${organizationId}, Conv: ${conversationId})`);
            return;
          }
          const mediaResponse = await this.whatsappService.sendMediaMessage("""
c = c.replace(media_call, new_media)

# Then the text check
text_call = """const metaResponse = await this.whatsappService.sendTextMessage("""
new_text = """
            const authOk = await this.deliveryAuth.authorizeDelivery(organizationId, conversationId);
            if (!authOk) {
              this.logger.warn(`Delivery aborted for text bubble ${i} (Org: ${organizationId}, Conv: ${conversationId})`);
              return;
            }
            const metaResponse = await this.whatsappService.sendTextMessage("""
c = c.replace(text_call, new_text)

with open(file, "w") as f:
    f.write(c)
