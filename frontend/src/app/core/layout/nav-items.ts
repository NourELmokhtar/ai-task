export interface NavItem {
  readonly path: string;
  readonly label: string;
}

/** Main navigation in PRD order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/habits', label: 'Habits' },
  { path: '/learning', label: 'Learning Resources' },
  { path: '/plans', label: 'Todo Plans' },
  { path: '/settings', label: 'Settings' },
];
