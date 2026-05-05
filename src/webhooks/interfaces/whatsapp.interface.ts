export interface WhatsAppWebhookPayload {
  object: string; // usually 'whatsapp_business_account'
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string; // The WhatsApp Business Account ID (wabaId)
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: string; // usually 'messages'
}

export interface WhatsAppChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WhatsAppMessage {
  from: string; // The customer's phone number
  id: string; // The specific message ID
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'document'
    | 'interactive'
    | 'button'
    | 'unknown';
  text?: {
    body: string;
  };
  // Add other types as you expand (e.g., audio: { id: string }, etc.)
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}
