import re

def fix_follow_up():
    file = "src/follow-ups/follow-up.processor.ts"
    with open(file, "r") as f:
        c = f.read()

    c = c.replace("type: 'SYSTEM',", "type: 'SYSTEM' as any,")
    c = c.replace("handledBy: 'SYSTEM',", "handledBy: 'SYSTEM' as any,")
    
    if "import { DeliveryAuthService }" not in c:
        c = c.replace(
            "import { FollowUpService } from './follow-up.service';",
            "import { FollowUpService } from './follow-up.service';\nimport { DeliveryAuthService } from '../webhooks/delivery-auth.service';"
        )
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
        type: 'SYSTEM' as any,
        handledBy: 'SYSTEM' as any,
      },
    });
    this.eventsGateway.broadcastNewMessage(organizationId, aiMessage);
  }

  """ + process_sig

    if "private async recordCancellation" not in c:
        c = c.replace(process_sig, new_method)

    with open(file, "w") as f:
        f.write(c)

fix_follow_up()
fix_ai_reply()

