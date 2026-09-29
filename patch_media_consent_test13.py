import sys

path = 'test/media-consent.e2e-spec.ts'
with open(path, 'r') as f:
    content = f.read()

# Add a check
new_block = """    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const msg = await prisma.message.findFirst({ where: { metaMessageId: 'wamid.img2' } });
      console.log('MSG WITH CONSENT:', msg);
      expect(msg!.mediaUrl).toContain('mockbase64');
    });"""

content = content.replace("    await tenantStorage.run({ isSystemBypass: true }, async () => {\n      const msg = await prisma.message.findFirst({ where: { metaMessageId: 'wamid.img2' } });\n      expect(msg!.mediaUrl).toContain('mockbase64');\n    });", new_block)

with open(path, 'w') as f:
    f.write(content)
