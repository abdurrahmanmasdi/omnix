-- An UNKNOWN outbound attempt is routed to staff once (KI-029).
ALTER TABLE "outbound_attempts" ADD COLUMN "escalatedAt" TIMESTAMP(3);
