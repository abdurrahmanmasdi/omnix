export const PERMISSIONS_CATALOG = [
  // Leads
  { action: 'leads:view', description: 'View leads' },
  {
    action: 'leads:read:all',
    description: 'View all leads regardless of assignment',
  },
  { action: 'leads:manage', description: 'Create, update, or delete leads' },
  { action: 'leads:export', description: 'Export lead data' },
  {
    action: 'leads:read:pii',
    description: 'View unmasked lead contact and social data',
  },
  {
    action: 'leads:read:messages',
    description: 'View lead conversation history',
  },

  // Conversations
  { action: 'view_conversations', description: 'View conversations' },
  { action: 'reply_conversations', description: 'Reply to conversations' },
  {
    action: 'manage_conversations',
    description: 'Manage conversations (e.g., toggle AI)',
  },

  // Documents
  { action: 'documents:view', description: 'View knowledge base documents' },
  {
    action: 'documents:manage',
    description: 'Upload and delete knowledge base documents',
  },

  // Channels
  { action: 'view_channels', description: 'View channels' },
  { action: 'manage_channels', description: 'Manage channels' },

  // Integrations
  { action: 'settings:crm:view', description: 'View CRM integrations' },
  {
    action: 'settings:crm:sync',
    description: 'Configure and enable CRM synchronization',
  },

  // AI Settings
  { action: 'ai_settings:view', description: 'View AI persona settings' },
  { action: 'ai_settings:manage', description: 'Update AI persona settings' },

  // Experiences
  { action: 'experiences:view', description: 'View social proof experiences' },
  {
    action: 'experiences:manage',
    description: 'Create, update, and delete experiences',
  },

  // Pipeline Settings
  {
    action: 'pipeline:view',
    description: 'View pipeline stages and lead sources',
  },
  {
    action: 'pipeline:manage',
    description: 'Create, update, and delete pipeline stages and lead sources',
  },

  // Notifications
  { action: 'notifications:view', description: 'View notifications' },
  { action: 'notifications:manage', description: 'Mark notifications as read' },

  // Analytics
  { action: 'analytics:view', description: 'View analytics dashboard' },

  // Organization Administration
  {
    action: 'organization:manage',
    description: 'Manage organization settings, security, and ownership',
  },
] as const;

export type PermissionAction = (typeof PERMISSIONS_CATALOG)[number]['action'];

export const ROLE_PERMISSIONS = {
  'Super Admin': PERMISSIONS_CATALOG.map((p) => p.action),
  Manager: PERMISSIONS_CATALOG.map((p) => p.action).filter(
    (a) => a !== 'organization:manage',
  ),
  Agent: [
    'leads:view',
    'leads:manage',
    'leads:read:pii',
    'leads:read:messages',
    'view_conversations',
    'reply_conversations',
    'manage_conversations',
    'documents:view',
    'view_channels',
    'experiences:view',
    'pipeline:view',
    'notifications:view',
    'notifications:manage',
  ],
} as const;
