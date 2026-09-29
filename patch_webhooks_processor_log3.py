import sys

path = 'src/webhooks/webhooks.processor.ts'
with open(path, 'r') as f:
    content = f.read()

content = content.replace("const consentGranted = !!conversation?.lead?.mediaConsentGranted;", "const consentGranted = !!conversation?.lead?.mediaConsentGranted;\nconsole.log('--- FETCHED LEAD ---', conversation?.lead);")

with open(path, 'w') as f:
    f.write(content)
