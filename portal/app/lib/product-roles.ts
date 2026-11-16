import type { RoleDefinition } from '@chester-hill-solutions/auth';

// The portal grants owners/admins the same invitation rights; neither may invite another admin.
export const CANCODER_ROLES: readonly RoleDefinition[] = [
  { id: 'owner', rank: 1, invites: ['member'] },
  { id: 'admin', rank: 1, invites: ['member'] },
  { id: 'member', rank: 0, invites: [] },
];
