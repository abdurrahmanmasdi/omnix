import sys

path = 'src/webhooks/webhooks.processor.ts'
with open(path, 'r') as f:
    content = f.read()

# I want to add some debugging
content = content.replace("this.logger.log(`Processing message ${message.id} from ${senderWaId}`);", "this.logger.log(`Processing message ${message.id} from ${senderWaId}`);\nconsole.log('--- PROCESSING MESSAGE ---', message.id);")
content = content.replace("this.logger.warn(\n                'Webhook channel routing is missing or ambiguous.',\n              );", "this.logger.warn(\n                'Webhook channel routing is missing or ambiguous.',\n              ); console.log('--- NO CHANNEL ---', receivingPhoneNumberId, matchingChannels);")

with open(path, 'w') as f:
    f.write(content)
