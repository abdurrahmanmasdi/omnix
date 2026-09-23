import re

file = "src/webhooks/webhooks.processor.ts"
with open(file, "r") as f:
    c = f.read()

old_tx = """            const wpMessage = await this.prisma.message.create({
              data: {
                conversationId: conversation.id,
                metaMessageId: message.id,
                content: message.text?.body || '', // Empty if it's purely an image
                type: message.type === 'image' ? 'IMAGE' : message.type === 'audio' ? 'AUDIO' : 'CUSTOMER_TEXT',
                handledBy: 'SYSTEM', // Not handled yet
                mediaUrl:
                  s3Key || (message.type === 'image' ? '[Patient Image - Processing]' : null),
              },
            });

            // 4. Update the conversation status and stateVersion
            const updatedConv = await this.prisma.conversation.update({
              where: { id: conversation.id },
              data: { status: 'ACTIVE', updatedAt: new Date(), stateVersion: { increment: 1 } },
            });"""

new_tx = """            const [wpMessage, updatedConv, outboxEvent] = await this.prisma.$transaction([
              this.prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  metaMessageId: message.id,
                  content: message.text?.body || '', // Empty if it's purely an image
                  type: message.type === 'image' ? 'IMAGE' : message.type === 'audio' ? 'AUDIO' : 'CUSTOMER_TEXT',
                  handledBy: 'SYSTEM', // Not handled yet
                  mediaUrl:
                    s3Key || (message.type === 'image' ? '[Patient Image - Processing]' : null),
                },
              }),
              this.prisma.conversation.update({
                where: { id: conversation.id },
                data: { status: 'ACTIVE', updatedAt: new Date(), stateVersion: { increment: 1 } },
              }),
              this.prisma.outboxEvent.create({
                data: {
                  topic: 'generate-reply',
                  organizationId: organization.id,
                  payload: {}, // We will update the payload in the next step since we need updatedConv.stateVersion
                  status: 'PENDING',
                },
              })
            ]);

            await this.prisma.outboxEvent.update({
              where: { id: outboxEvent.id },
              data: {
                payload: {
                  organizationId: organization.id,
                  conversationId: conversation.id,
                  customerPhone: customerPhone,
                  stateVersion: updatedConv.stateVersion,
                }
              }
            });"""

c = c.replace(old_tx, new_tx)

old_debounce = """                // Look for an existing countdown timer
                const existingJob = await this.aiReplyQueue.getJob(jobId);
                let newMessageIds: string[] = [wpMessage.id];

                if (existingJob) {
                  // Merge message IDs from the existing job
                  if (existingJob.data && Array.isArray(existingJob.data.newMessageIds)) {
                    newMessageIds = [...existingJob.data.newMessageIds, wpMessage.id];
                  }
                  await existingJob.remove();
                  this.logger.log(
                    `User is typing again... Resetting 25s timer for Conv: ${conversation.id}. Merged ${newMessageIds.length} messages.`,
                  );
                }

                // Add a NEW 25-second timer
                await this.aiReplyQueue.add(
                  'generate-reply',
                  {
                    organizationId: organization.id,
                    conversationId: conversation.id,
                    customerPhone: customerPhone,
                    newMessageIds: newMessageIds, // 🚀 NEW: Pass the array of IDs instead of inline media/text
                    stateVersion: conversation.stateVersion + 1, // T13: Pass the version to check immediately before sending
                  },
                  {
                    jobId: jobId, // This ensures we can find and delete it later
                    delay: 7000, // Wait exactly 7 seconds
                    removeOnComplete: true,
                  },
                );"""

# Replace it with immediate dispatch of outbox event (optimistic dispatch)
new_debounce = """                // We use optimistic immediate dispatch. The Outbox processor handles fallback.
                try {
                  await this.aiReplyQueue.add(
                    'generate-reply',
                    {
                      organizationId: organization.id,
                      conversationId: conversation.id,
                      customerPhone: customerPhone,
                      stateVersion: updatedConv.stateVersion,
                    },
                    {
                      jobId: `reply-${conversation.id}-${updatedConv.stateVersion}`,
                      delay: 7000,
                      removeOnComplete: true,
                    },
                  );
                  // Optimistically mark as PROCESSED so outbox cron doesn't double schedule
                  await this.prisma.outboxEvent.update({
                    where: { id: outboxEvent.id },
                    data: { status: 'PROCESSED', processedAt: new Date() }
                  });
                } catch (err) {
                  this.logger.error(`Immediate dispatch failed for outbox event ${outboxEvent.id}, fallback to cron`, err);
                }"""

c = c.replace(old_debounce, new_debounce)

with open(file, "w") as f:
    f.write(c)
