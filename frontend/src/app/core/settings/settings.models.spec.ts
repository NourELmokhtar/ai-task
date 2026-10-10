import {
  DEFAULT_SETTINGS,
  DEFAULT_VIEW_LABELS,
  DEFAULT_VIEWS,
  DefaultView,
  defaultViewRoute,
  FALLBACK_ROUTE,
  isDefaultView,
} from './settings.models';

describe('settings models', () => {
  const expected: [DefaultView, string][] = [
    ['Dashboard', '/dashboard'],
    ['Tasks', '/tasks'],
    ['Habits', '/habits'],
    ['LearningResources', '/learning'],
    ['TodoPlans', '/plans'],
    ['Settings', '/settings'],
  ];

  for (const [view, route] of expected) {
    it(`defaultViewRoute('${view}') is ${route}`, () => {
      expect(defaultViewRoute(view)).toBe(route);
    });
  }

  it('falls back to /dashboard for unknown, missing or differently cased values', () => {
    for (const v of ['Unknown', '', null, undefined, 'tasks', 3]) {
      expect(defaultViewRoute(v)).toBe('/dashboard');
    }
    expect(FALLBACK_ROUTE).toBe('/dashboard');
  });

  it('lists the six views in nav order with readable labels', () => {
    expect(DEFAULT_VIEWS).toEqual(expected.map(([v]) => v));
    expect(DEFAULT_VIEWS.map((v) => DEFAULT_VIEW_LABELS[v])).toEqual([
      'Dashboard',
      'Tasks',
      'Habits',
      'Learning Resources',
      'Todo Plans',
      'Settings',
    ]);
  });

  it('isDefaultView accepts only the exact names', () => {
    expect(isDefaultView('TodoPlans')).toBeTrue();
    expect(isDefaultView('todoplans')).toBeFalse();
    expect(isDefaultView(null)).toBeFalse();
  });

  it('defaults are notifications on, Dashboard, no name (A-03)', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      displayName: null,
      planStartNotificationsEnabled: true,
      defaultView: 'Dashboard',
      updatedAt: null,
    });
  });
});
