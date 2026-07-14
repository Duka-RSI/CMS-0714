import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { PublishStatusList } from './publish-status-list';
import { PublishStatusService } from '@app/core/services/publish-status.service';
import { PublishStatus } from '@app/core/models/publish-status.model';

describe('PublishStatusList', () => {
  let fixture: ComponentFixture<PublishStatusList>;
  let component: PublishStatusList;
  let serviceSpy: jasmine.SpyObj<PublishStatusService>;

  const statuses: PublishStatus[] = [
    { pkid: 1, description: '草稿', isDraft: true, isPublished: false, isDiscontinued: false },
    { pkid: 2, description: '已發布', isDraft: false, isPublished: true, isDiscontinued: false },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['query', 'delete']);
    serviceSpy.query.and.returnValue(of(statuses));
    serviceSpy.delete.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [PublishStatusList],
      providers: [
        { provide: PublishStatusService, useValue: serviceSpy },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(PublishStatusList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit -> load()
  });

  it('creates and loads statuses on init', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['statuses']().length).toBe(2);
  });

  it('renders one row per status', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('已發布');
  });

  it('applyFilter persists filters to sessionStorage and reloads', () => {
    component['filters'] = { keyword: '草', isDraft: null, isPublished: null, isDiscontinued: null };
    component['applyFilter']();
    expect(sessionStorage.getItem('publish-status-list-filters')).toContain('草');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('clearFilter resets filters and removes saved state', () => {
    component['filters'] = { keyword: '草', isDraft: true, isPublished: null, isDiscontinued: null };
    sessionStorage.setItem('publish-status-list-filters', JSON.stringify(component['filters']));
    component['clearFilter']();
    expect(sessionStorage.getItem('publish-status-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
  });

  it('is not marked as filtered before any filter is applied', () => {
    expect(component['isFiltered']()).toBeFalse();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('highlights as filtered and lists applied chips after applyFilter', () => {
    component['filters'] = { keyword: '草', isDraft: true, isPublished: null, isDiscontinued: null };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    expect(component['activeFilterCount']()).toBe(2);
    expect(component['appliedFilters']()).toEqual([
      { label: '關鍵字', value: '草' },
      { label: '草稿', value: '是' },
    ]);
  });

  it('confirmDelete deletes the status when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](statuses[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith(1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](statuses[1]);
    expect(navSpy).toHaveBeenCalledWith(['/publish-statuses', 2, 'edit']);
  });
});
