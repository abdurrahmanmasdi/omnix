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
  history?: {
    metadata?: { phase: number; chunk_order: number; progress: number };
    errors?: { code: number }[];
    threads?: { id: string; messages?: WhatsAppMessage[] }[];
  }[];
  message_echoes?: (WhatsAppMessage & { to: string })[];
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
  to?: string;
  from: string; // The customer's phone number
  id: string; // The specific message ID
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'voice'
    | 'document'
    | 'interactive'
    | 'button'
    | 'media_placeholder'
    | 'video'
    | 'unknown';
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type?: string;
    sha256?: string;
  };
  audio?: {
    id: string;
    mime_type?: string;
  };
  voice?: {
    id: string;
    mime_type?: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
  };
  button?: {
    text: string;
  };
  // Add other types as you expand (e.g., document: { id: string }, etc.)
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  biz_opaque_callback_data?: string;
}
