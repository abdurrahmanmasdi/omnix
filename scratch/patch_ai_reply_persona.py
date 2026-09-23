import re

file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()

old_disclosure = """      if (!conversation.aiDisclosureSent && conversation.channel) {
        const disclosureMessage = conversation.organization?.aiDisclosureText || "Hi! I'm an AI assistant. I can help answer your questions. Reply 'human' at any time to speak with a real person.";"""

new_disclosure = """      if (!conversation.aiDisclosureSent && conversation.channel) {
        const persona = await this.prisma.aiPersona.findUnique({ where: { organizationId } });
        const disclosureMessage = persona?.aiDisclosureText || "Hi! I'm an AI assistant. I can help answer your questions. Reply 'human' at any time to speak with a real person.";"""

c = c.replace(old_disclosure, new_disclosure)

with open(file, "w") as f:
    f.write(c)
