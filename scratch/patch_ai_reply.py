file = "src/webhooks/ai-reply.processor.ts"
with open(file, "r") as f:
    c = f.read()
c = c.replace("safeMediaUrl = null;", "safeMediaUrl = undefined;")
with open(file, "w") as f:
    f.write(c)

file2 = "src/experiences/experiences.service.ts"
with open(file2, "r") as f:
    c = f.read()
c = c.replace("dto.consentObtained !== false", "dto.consentObtained === true")
with open(file2, "w") as f:
    f.write(c)
