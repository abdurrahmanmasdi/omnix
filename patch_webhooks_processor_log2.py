import sys

path = 'src/webhooks/webhooks.processor.ts'
with open(path, 'r') as f:
    content = f.read()

target = """                const consentGranted =
                  conversation.lead?.mediaConsentGranted &&
                  (!conversation.lead.mediaConsentWithdrawnAt ||
                    conversation.lead.mediaConsentGrantedAt! >
                      conversation.lead.mediaConsentWithdrawnAt);"""

new_val = """                const consentGranted =
                  conversation.lead?.mediaConsentGranted &&
                  (!conversation.lead.mediaConsentWithdrawnAt ||
                    conversation.lead.mediaConsentGrantedAt! >
                      conversation.lead.mediaConsentWithdrawnAt);
                console.log('CONSENT CHECK FOR MSG', message.id, '->', consentGranted, conversation.lead);"""

content = content.replace(target, new_val)

with open(path, 'w') as f:
    f.write(content)
