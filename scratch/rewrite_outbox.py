import re

file = "src/core/outbox/outbox.processor.ts"
with open(file, "r") as f:
    c = f.read()

old_loop = """        for (const event of events) {
          try {
            // Push to BullMQ or external service depending on topic
            await this.outboxRelayQueue.add(event.topic, event.payload, {
              jobId: `outbox-${event.id}`,
              removeOnComplete: true,
              removeOnFail: false,
            });

            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: 'PROCESSED',
                processedAt: new Date(),
              },
            });
          } catch (error: any) {
            this.logger.error(`Failed to process outbox event ${event.id}: ${error.message}`);
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: 'FAILED',
                error: error.message,
              },
            });
          }
        }"""

new_loop = """        // Group AI reply events by conversationId to batch newMessageIds
        const aiReplyEvents = events.filter(e => e.topic === 'generate-reply');
        const otherEvents = events.filter(e => e.topic !== 'generate-reply');

        const groups = new Map<string, typeof aiReplyEvents>();
        for (const event of aiReplyEvents) {
          const convId = (event.payload as any).conversationId;
          if (!groups.has(convId)) groups.set(convId, []);
          groups.get(convId)!.push(event);
        }

        for (const [convId, group] of groups.entries()) {
          try {
            const newMessageIds = group.map(e => (e.payload as any).messageId).filter(Boolean);
            const latestStateVersion = Math.max(...group.map(e => (e.payload as any).stateVersion || 0));
            const firstPayload = group[0].payload as any;

            await this.outboxRelayQueue.add('generate-reply', {
              organizationId: firstPayload.organizationId,
              conversationId: convId,
              customerPhone: firstPayload.customerPhone,
              newMessageIds,
              stateVersion: latestStateVersion,
            }, {
              jobId: `reply-${convId}-${latestStateVersion}`,
              delay: 7000,
              removeOnComplete: true,
            });

            await this.prisma.outboxEvent.updateMany({
              where: { id: { in: group.map(e => e.id) } },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
          } catch (err: any) {
            this.logger.error(`Failed to process batched ai-reply for ${convId}: ${err.message}`);
            await this.prisma.outboxEvent.updateMany({
              where: { id: { in: group.map(e => e.id) } },
              data: { status: 'FAILED', error: err.message },
            });
          }
        }

        for (const event of otherEvents) {
          try {
            await this.outboxRelayQueue.add(event.topic, event.payload, {
              jobId: `outbox-${event.id}`,
              removeOnComplete: true,
              removeOnFail: false,
            });
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PROCESSED', processedAt: new Date() },
            });
          } catch (error: any) {
            this.logger.error(`Failed to process outbox event ${event.id}: ${error.message}`);
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'FAILED', error: error.message },
            });
          }
        }"""

c = c.replace(old_loop, new_loop)
with open(file, "w") as f:
    f.write(c)
