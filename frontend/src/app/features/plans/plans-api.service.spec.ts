import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { ApiError } from '../../core/api/api-error';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { planItemPath, PlansApi } from './plans-api.service';
import { CreatePlanRequest, PlanDto } from './plans.models';
import { makePlan } from './testing/plan-fixtures';

const BASE = 'http://api.test';
const PLANS = `${BASE}/api/plans`;

describe('PlansApi', () => {
  let api: PlansApi;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: `${BASE}/` },
      ],
    });
    api = TestBed.inject(PlansApi);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('list GETs /api/plans without params', () => {
    let result: PlanDto[] | undefined;
    api.list().subscribe((r) => (result = r));
    const req = ctrl.expectOne(PLANS);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([makePlan()]);
    expect(result?.length).toBe(1);
  });

  it('list passes the optional M07 group filter', () => {
    api.list({ group: 'completed' }).subscribe();
    const req = ctrl.expectOne((r) => r.url === PLANS);
    expect(req.request.params.get('group')).toBe('completed');
    req.flush([]);
  });

  it('get GETs one plan', () => {
    api.get(7).subscribe();
    const req = ctrl.expectOne(`${PLANS}/7`);
    expect(req.request.method).toBe('GET');
    req.flush(makePlan({ id: 7 }));
  });

  it('create POSTs the request as-is', () => {
    const body: CreatePlanRequest = {
      title: 'P',
      estimatedDurationMinutes: 60,
      startDateTime: '2026-10-11T06:00:00.000Z',
      endDateTime: '2026-10-11T07:00:00.000Z',
      priorityOrder: 1,
      items: [{ sourceType: 'Task', sourceId: 1 }],
    };
    api.create(body).subscribe();
    const req = ctrl.expectOne(PLANS);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(makePlan(), { status: 201, statusText: 'Created' });
  });

  it('update PUTs metadata to /api/plans/{id}', () => {
    const body = {
      title: 'P',
      estimatedDurationMinutes: 30,
      startDateTime: '2026-10-11T06:00:00.000Z',
      endDateTime: '2026-10-11T07:00:00.000Z',
      priorityOrder: 4,
    };
    api.update(3, body).subscribe();
    const req = ctrl.expectOne(`${PLANS}/3`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush(makePlan({ id: 3 }));
  });

  it('delete DELETEs /api/plans/{id}', () => {
    api.delete(5).subscribe();
    const req = ctrl.expectOne(`${PLANS}/5`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('planItemPath builds the PATCH route', () => {
    expect(planItemPath(2, 9)).toBe('/api/plans/2/items/9');
  });

  it('setItemDone PATCHes /api/plans/{id}/items/{itemId} with { isDone } and returns the full plan', () => {
    let result: PlanDto | undefined;
    api.setItemDone(2, 9, true).subscribe((p) => (result = p));
    const req = ctrl.expectOne(`${PLANS}/2/items/9`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isDone: true });
    req.flush(makePlan({ id: 2, progressPercent: 33 }));
    expect(result?.progressPercent).toBe(33);

    api.setItemDone(2, 9, false).subscribe();
    expect(ctrl.expectOne(`${PLANS}/2/items/9`).request.body).toEqual({ isDone: false });
  });

  it('a 400 with items[i] keys arrives as ApiError field errors', () => {
    let error: ApiError | undefined;
    api.create({} as CreatePlanRequest).subscribe({ error: (e) => (error = e) });
    ctrl.expectOne(PLANS).flush(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { 'items[1].sourceId': ["Task with id '999' does not exist or has been deleted."] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(error?.isValidationError).toBeTrue();
    expect(error?.errorsFor('items[1].sourceId')).toEqual(["Task with id '999' does not exist or has been deleted."]);
  });
});
