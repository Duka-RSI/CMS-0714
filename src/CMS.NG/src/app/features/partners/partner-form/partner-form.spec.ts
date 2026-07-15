import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { PartnerForm } from './partner-form';
import { PartnerService } from '@app/core/services/partner.service';
import { Partner } from '@app/core/models/partner.model';

const partner: Partner = {
  pkid: 2,
  name: 'Oracle',
  appKey: 'ORA',
  nameOnPartnerMenu: 'Oracle 課程',
  nameOnCourseDetailPage: 'Oracle',
  displayOrder: 2,
  imageFilename: null,
};

function setup(routeId: string | null) {
  const service = jasmine.createSpyObj<PartnerService>('PartnerService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(partner));
  service.create.and.returnValue(of(partner));
  service.update.and.returnValue(of(void 0));

  TestBed.configureTestingModule({
    imports: [PartnerForm],
    providers: [
      { provide: PartnerService, useValue: service },
      MessageService,
      provideRouter([]),
      provideNoopAnimations(),
      // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<PartnerForm> = TestBed.createComponent(PartnerForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, service };
}

// The toolbar must stay pinned (position: sticky) so 儲存/取消 remain reachable on long forms.
function expectStickyToolbar(fixture: ComponentFixture<PartnerForm>): void {
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

describe('PartnerForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in add mode', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
  });

  it('does not submit an invalid form', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
    expect(component['form'].controls.name.touched).toBeTrue();
  });

  it('creates the partner when the form is valid', () => {
    const { component, service } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({
      name: 'AWS',
      appKey: 'AWS',
      nameOnPartnerMenu: 'AWS 雲端課程',
      nameOnCourseDetailPage: 'AWS',
      displayOrder: 3,
      imageFilename: null,
    });
    component['save']();

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.name).toBe('AWS');
    expect(arg.pkid).toBe(0); // IDENTITY placeholder in add mode
    expect(navSpy).toHaveBeenCalledWith(['/partners']);
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup(null);
    expectStickyToolbar(fixture);
  });
});

describe('PartnerForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the partner, patches the form and disables pkid', () => {
    const { component, service } = setup('2');
    expect(service.getById).toHaveBeenCalledWith(2);
    expect(component['isEdit']()).toBeTrue();
    expect(component['form'].controls.name.value).toBe('Oracle');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  it('updates the partner on save, keeping the disabled pkid in the payload', () => {
    const { component, service } = setup('2');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ name: 'Oracle (edited)' });
    component['save']();

    expect(service.update).toHaveBeenCalledTimes(1);
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(2);
    expect(arg.name).toBe('Oracle (edited)');
    expect(navSpy).toHaveBeenCalledWith(['/partners']);
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup('2');
    expectStickyToolbar(fixture);
  });
});
