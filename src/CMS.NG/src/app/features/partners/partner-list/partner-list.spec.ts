import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { PartnerList } from './partner-list';
import { PartnerService } from '@app/core/services/partner.service';
import { Partner } from '@app/core/models/partner.model';

describe('PartnerList', () => {
  let fixture: ComponentFixture<PartnerList>;
  let component: PartnerList;
  let serviceSpy: jasmine.SpyObj<PartnerService>;

  const partners: Partner[] = [
    {
      pkid: 1,
      name: '微軟',
      appKey: 'MS',
      nameOnPartnerMenu: '微軟認證課程',
      nameOnCourseDetailPage: '微軟',
      displayOrder: 1,
      imageFilename: 'ms.png',
    },
    {
      pkid: 2,
      name: 'Oracle',
      appKey: 'ORA',
      nameOnPartnerMenu: 'Oracle 課程',
      nameOnCourseDetailPage: 'Oracle',
      displayOrder: 2,
      imageFilename: null,
    },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<PartnerService>('PartnerService', ['query', 'delete']);
    serviceSpy.query.and.returnValue(of(partners));
    serviceSpy.delete.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [PartnerList],
      providers: [
        { provide: PartnerService, useValue: serviceSpy },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(PartnerList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit -> load()
  });

  it('creates and loads partners on init', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['partners']().length).toBe(2);
  });

  it('renders one row per partner', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Oracle');
  });

  it('applyFilter persists filters to sessionStorage and reloads', () => {
    component['filters'] = { keyword: '微軟' };
    component['applyFilter']();
    expect(sessionStorage.getItem('partner-list-filters')).toContain('微軟');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('clearFilter resets filters and removes saved state', () => {
    component['filters'] = { keyword: '微軟' };
    sessionStorage.setItem('partner-list-filters', JSON.stringify(component['filters']));
    component['clearFilter']();
    expect(sessionStorage.getItem('partner-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
  });

  it('is not marked as filtered before any filter is applied', () => {
    expect(component['isFiltered']()).toBeFalse();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('highlights as filtered and lists the applied chip after applyFilter', () => {
    component['filters'] = { keyword: '微軟' };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    expect(component['activeFilterCount']()).toBe(1);
    expect(component['appliedFilters']()).toEqual([{ label: '關鍵字', value: '微軟' }]);
  });

  it('confirmDelete deletes the partner when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](partners[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith(1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](partners[1]);
    expect(navSpy).toHaveBeenCalledWith(['/partners', 2, 'edit']);
  });
});
