import {
  clearTaskFilters,
  DEFAULT_TASK_FILTERS,
  hasActiveFilters,
  isInvalidDueRange,
  TaskDto,
  TaskFilters,
  toTaskListQuery,
  toUpdateRequest,
} from './tasks.models';

const TODAY = '2026-10-10';
const f = (changes: Partial<TaskFilters> = {}): TaskFilters => ({ ...DEFAULT_TASK_FILTERS, ...changes });

describe('tasks.models', () => {
  describe('toTaskListQuery', () => {
    it('maps the defaults to sort + today only', () => {
      expect(toTaskListQuery(f(), TODAY)).toEqual({ sortBy: 'createdAt', sortDir: 'desc', today: TODAY });
    });

    it('trims search and drops it when blank', () => {
      expect(toTaskListQuery(f({ search: '  report ' }), TODAY).search).toBe('report');
      expect(toTaskListQuery(f({ search: '   ' }), TODAY).search).toBeUndefined();
    });

    it('maps status, priority, sort and archived', () => {
      expect(
        toTaskListQuery(f({ status: 'InProgress', priority: 'High', sort: 'dueDate:asc', showArchived: true }), TODAY),
      ).toEqual({
        sortBy: 'dueDate',
        sortDir: 'asc',
        today: TODAY,
        status: 'InProgress',
        priority: 'High',
        archived: true,
      });
    });

    it('maps "Overdue" to overdue=true', () => {
      const q = toTaskListQuery(f({ due: 'overdue' }), TODAY);
      expect(q.overdue).toBeTrue();
      expect(q.dueFrom).toBeUndefined();
      expect(q.dueTo).toBeUndefined();
    });

    it('maps "Due today" to dueFrom=dueTo=today', () => {
      const q = toTaskListQuery(f({ due: 'today', dueFrom: '2026-01-01' }), TODAY);
      expect([q.dueFrom, q.dueTo, q.overdue]).toEqual([TODAY, TODAY, undefined]);
    });

    it('maps a date range, including open-ended ranges', () => {
      const both = toTaskListQuery(f({ due: 'range', dueFrom: '2026-10-01', dueTo: '2026-10-31' }), TODAY);
      expect([both.dueFrom, both.dueTo]).toEqual(['2026-10-01', '2026-10-31']);
      const from = toTaskListQuery(f({ due: 'range', dueFrom: '2026-10-01' }), TODAY);
      expect([from.dueFrom, from.dueTo]).toEqual(['2026-10-01', undefined]);
    });

    it('ignores an inverted range and range dates when the mode is not "range"', () => {
      const inverted = f({ due: 'range', dueFrom: '2026-10-31', dueTo: '2026-10-01' });
      expect(isInvalidDueRange(inverted)).toBeTrue();
      const q = toTaskListQuery(inverted, TODAY);
      expect([q.dueFrom, q.dueTo]).toEqual([undefined, undefined]);
      const any = toTaskListQuery(f({ dueFrom: '2026-10-01', dueTo: '2026-10-31' }), TODAY);
      expect([any.dueFrom, any.dueTo]).toEqual([undefined, undefined]);
    });
  });

  it('hasActiveFilters ignores sort but counts every filter', () => {
    expect(hasActiveFilters(f({ sort: 'dueDate:desc' }))).toBeFalse();
    expect(hasActiveFilters(f({ search: ' ' }))).toBeFalse();
    for (const changes of [
      { search: 'x' },
      { status: 'Done' as const },
      { priority: 'Low' as const },
      { due: 'overdue' as const },
      { showArchived: true },
    ]) {
      expect(hasActiveFilters(f(changes))).withContext(JSON.stringify(changes)).toBeTrue();
    }
  });

  it('clearTaskFilters resets filters and keeps the sort', () => {
    const cleared = clearTaskFilters(f({ search: 'x', status: 'Done', due: 'range', dueFrom: '2026-01-01', showArchived: true, sort: 'dueDate:asc' }));
    expect(cleared).toEqual(f({ sort: 'dueDate:asc' }));
  });

  it('toUpdateRequest copies the editable fields and applies overrides', () => {
    const task: TaskDto = {
      id: 7,
      title: 'Write report',
      description: 'Q3',
      status: 'Done',
      priority: 'High',
      dueDate: '2026-10-20',
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
      isArchived: false,
      completedAt: '2026-10-10T11:00:00Z',
      isOverdue: false,
    };
    expect(toUpdateRequest(task, { status: 'Todo' })).toEqual({
      title: 'Write report',
      description: 'Q3',
      status: 'Todo',
      priority: 'High',
      dueDate: '2026-10-20',
    });
  });
});
