import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';

import { PublishStatusForm } from './publish-status-form';
import { PublishStatusService } from '@app/core/services/publish-status.service';
import { PublishStatus } from '@app/core/models/publish-status.model';

const status: PublishStatus = {
  pkid: 2,
  description: '已發布',
  isDraft: false,
  isPublished: true,
  isDiscontinued: false,
};

function setup(routeId: string | null) {
  const service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(status));
  service.create.and.returnValue(of(status));
  service.update.and.returnValue(of(void 0));

  TestBed.configureTestingModule({
    imports: [PublishStatusForm],
    providers: [
      { provide: PublishStatusService, useValue: service },
      MessageService,
      provideRouter([]),
      provideNoopAnimations(),
      provideHttpClient(),
      provideHttpClientTesting(),
      // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<PublishStatusForm> = TestBed.createComponent(PublishStatusForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, service };
}

// The toolbar must stay pinned (position: sticky) so 儲存/取消 remain reachable on long forms.
function expectStickyToolbar(fixture: ComponentFixture<PublishStatusForm>): void {
  const header = (fixture.nativeElement as HTMLElement).querySelector('.page-header')!;
  const style = getComputedStyle(header);
  expect(style.position).toBe('sticky');
  expect(style.top).toBe('-20px');
  const labels = Array.from(header.querySelectorAll('.actions button')).map(
    (b) => b.textContent?.trim() ?? '',
  );
  expect(labels).toContain('取消');
  expect(labels).toContain('儲存');
}

describe('PublishStatusForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in add mode with pkid enabled', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].controls.pkid.enabled).toBeTrue();
  });

  it('does not submit an invalid form', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
    expect(component['form'].controls.pkid.touched).toBeTrue();
  });

  it('creates the status when the form is valid', () => {
    const { component, service } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({
      pkid: 5,
      description: '已停用',
      isDraft: false,
      isPublished: false,
      isDiscontinued: true,
    });
    component['save']();

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(5);
    expect(arg.isDiscontinued).toBeTrue();
    expect(navSpy).toHaveBeenCalledWith(['/publish-statuses']);
  });

  it('shows a conflict message when the pkid already exists', () => {
    const { component, service } = setup(null);
    service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const messageService = TestBed.inject(MessageService);
    const addSpy = spyOn(messageService, 'add');

    component['form'].patchValue({ pkid: 1, description: 'Dup' });
    component['save']();

    expect(addSpy).toHaveBeenCalled();
    const msg = addSpy.calls.mostRecent().args[0];
    expect(msg.detail).toContain('已存在');
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup(null);
    expectStickyToolbar(fixture);
  });
});

describe('PublishStatusForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the status, patches the form and disables pkid', () => {
    const { component, service } = setup('2');
    expect(service.getById).toHaveBeenCalledWith(2);
    expect(component['isEdit']()).toBeTrue();
    expect(component['form'].controls.description.value).toBe('已發布');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
    expect(component['form'].controls.isPublished.value).toBeTrue();
  });

  it('updates the status on save, keeping the disabled pkid in the payload', () => {
    const { component, service } = setup('2');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ description: '已發布 (edited)' });
    component['save']();

    expect(service.update).toHaveBeenCalledTimes(1);
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(2);
    expect(arg.description).toBe('已發布 (edited)');
    expect(navSpy).toHaveBeenCalledWith(['/publish-statuses']);
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup('2');
    expectStickyToolbar(fixture);
  });
});
