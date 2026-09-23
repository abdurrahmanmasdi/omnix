import re

def fix_follow_up():
    file = "src/follow-ups/follow-up.processor.ts"
    with open(file, "r") as f:
        c = f.read()

    # Add DeliveryAuthService import if missing
    if "DeliveryAuthService" not in c.split("export class")[0]:
        c = c.replace(
            "import { FollowUpService } from './follow-up.service';",
            "import { FollowUpService } from './follow-up.service';\nimport { DeliveryAuthService } from '../webhooks/delivery-auth.service';"
        )

    # Replace process signature to inject recordCancellation
    process_sig = "async process(job: Job<{ followUpId: string }>): Promise<any> {"
    new_method = """
  private async recordCancellation(conversationId: string, organizationId: string, reason: string) {
    const sysMsg = await this.prisma.message.create({
      data: {
        conversationId,
        content: `[SYSTEM: Follow-up Cancelled] ${reason}`,
        type: 'SYSTEM',
        handledBy: 'SYSTEM',
      },
    });
    this.eventsGateway.broadcastNewMessage(organizationId, sysMsg);
  }

  """ + process_sig
    
    if "private async recordCancellation" not in c:
        c = c.replace(process_sig, new_method)

    c = c.replace("await this.recordCancellation(conversationId", "await this.recordCancellation(conversation.id")
    
    with open(file, "w") as f:
        f.write(c)


def fix_ai_reply():
    file = "src/webhooks/ai-reply.processor.ts"
    with open(file, "r") as f:
        c = f.read()

    process_sig = "async process(job: Job<any, any, string>): Promise<any> {"
    new_method = """
  private async recordCancellation(conversationId: string, organizationId: string, reason: string) {
    const aiMessage = await this.prisma.message.create({
      data: {
        conversationId,
        content: `[SYSTEM: Generation Cancelled] ${reason}`,
        type: 'SYSTEM',
        handledBy: 'SYSTEM',
      },
    });
    this.eventsGateway.broadcastNewMessage(organizationId, aiMessage);
  }

  """ + process_sig

    if "private async recordCancellation" not in c:
        c = c.replace(process_sig, new_method)

    # Fix stateVersion scope issue:
    # State version might be inside the if (disclosureText) block, making it inaccessible later.
    # It was destructured at the top, let's check where.

    with open(file, "w") as f:
        f.write(c)

fix_follow_up()
fix_ai_reply()
