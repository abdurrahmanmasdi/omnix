import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

# 1. Add isHandoffRequested
handoff_fn = """
  private isHandoffRequested(text: string): boolean {
    const normalized = text.trim().toLocaleLowerCase();
    return /^(human|agent|person|representative|operator|real person|talk to someone|help|support|mensch|mitarbeiter|berater|hilfe|insan|temsilci|müşteri temsilcisi|yardım|humano|agente|persona|asistencia)$/iu.test(normalized);
  }

  async process("""
c = c.replace("  async process(", handoff_fn)

# 2. Inject ActionExecutorService
old_constructor = """  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappMediaService: WhatsappMediaService,
    private readonly eventsGateway: EventsGateway,
    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly followUpService: FollowUpService,
  ) {}"""

new_constructor = """  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappMediaService: WhatsappMediaService,
    private readonly eventsGateway: EventsGateway,
    @InjectQueue('ai-reply') private readonly aiReplyQueue: Queue,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly followUpService: FollowUpService,
    private readonly actionExecutor: ActionExecutorService,
  ) {}"""

c = c.replace(old_constructor, new_constructor)

# 3. Add import
c = c.replace(
    "import { FollowUpService } from '../follow-ups/follow-up.service';",
    "import { FollowUpService } from '../follow-ups/follow-up.service';\nimport { ActionExecutorService } from './action-executor.service';"
)

# 4. Handle handoff in loop (right after isOptOut check)
old_optout = """              if (leadConsent?.optedOutAt) {
                this.logger.log(`Outbound automation suppressed for opted-out contact ${customerPhone}.`);
                continue;
              }"""

new_optout = """              if (leadConsent?.optedOutAt) {
                this.logger.log(`Outbound automation suppressed for opted-out contact ${customerPhone}.`);
                continue;
              }

              if (this.isHandoffRequested(messageContent)) {
                this.logger.log(`Explicit handoff requested by contact ${customerPhone} in conversation ${conversation.id}.`);
                await this.actionExecutor.handleHandoffToHuman(organization.id, conversation.id, "User requested to speak with a human.");
                continue; // Stop AI from generating a reply
              }"""

c = c.replace(old_optout, new_optout)

with open(file, "w") as f:
    f.write(c)
