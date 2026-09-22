export const PERMISSIONS_CATALOG = [
  { action: 'view_conversations', description: 'View conversations' },
  { action: 'reply_conversations', description: 'Reply to conversations' },
  { action: 'manage_conversations', description: 'Manage conversations' },
  { action: 'view_channels', description: 'View channels' },
  { action: 'manage_channels', description: 'Manage channels' },
  { action: 'leads:read:pii', description: 'View unmasked lead contact and social data' },
  { action: 'leads:read:messages', description: 'View lead conversation history' },
  { action: 'leads:export', description: 'Export lead data' },
  { action: 'settings:crm:sync', description: 'Configure and enable CRM synchronization' },
] as const;

export type PermissionAction = (typeof PERMISSIONS_CATALOG)[number]['action'];
