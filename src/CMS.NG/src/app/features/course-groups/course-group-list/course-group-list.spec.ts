import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { CourseGroupList } from './course-group-list';
import { CourseGroupService } from '@app/core/services/course-group.service';
import { CourseGroup } from '@app/core/models/course-group.model';

describe('CourseGroupList', () => {
  let fixture: ComponentFixture<CourseGroupList>;
  let component: CourseGroupList;
  let serviceSpy: jasmine.SpyObj<CourseGroupService>;

  const groups: CourseGroup[] = [
    { pkid: 1, description: '微軟課程', courseCount: 12, partnerCourseGroupCount: 2 },
    { pkid: 2, description: '思科課程', courseCount: 5, partnerCourseGroupCount: 0 },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['query', 'delete']);
    // p-table sorts the bound array in place (default sort pkid DESC) — hand out a copy
    // so the shared `groups` fixture keeps its order across tests.
    serviceSpy.query.and.callFake(() => of([...groups]));
    serviceSpy.delete.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [CourseGroupList],
      providers: [
        { provide: CourseGroupService, useValue: serviceSpy },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(CourseGroupList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit -> load()
  });

  it('creates and loads groups on init', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['groups']().length).toBe(2);
  });

  it('renders one row per group', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('微軟課程');
  });

  it('applyFilter persists filters to sessionStorage and reloads', () => {
    component['filters'] = { keyword: '微軟' };
    component['applyFilter']();
    expect(sessionStorage.getItem('course-group-list-filters')).toContain('微軟');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('clearFilter resets filters and removes saved state', () => {
    component['filters'] = { keyword: '微軟' };
    sessionStorage.setItem('course-group-list-filters', JSON.stringify(component['filters']));
    component['clearFilter']();
    expect(sessionStorage.getItem('course-group-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
  });

  it('highlights as filtered and lists applied chips after applyFilter', () => {
    component['filters'] = { keyword: '微軟' };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    expect(component['appliedFilters']()).toEqual([{ label: '關鍵字', value: '微軟' }]);
  });

  it('restores the filtered highlight from saved session filters on init', () => {
    sessionStorage.setItem('course-group-list-filters', JSON.stringify({ keyword: 'x' }));
    const f2 = TestBed.createComponent(CourseGroupList);
    f2.detectChanges();
    expect(f2.componentInstance['isFiltered']()).toBeTrue();
    expect(f2.componentInstance['activeFilterCount']()).toBe(1);
  });

  it('confirmDelete deletes the group when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](groups[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith(1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('confirmDelete message warns about the course cascade', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    const confirmSpy = spyOn(confirmationService, 'confirm').and.returnValue(confirmationService);

    component['confirmDelete'](groups[0]);

    const config = confirmSpy.calls.mostRecent().args[0];
    expect(config.message).toContain('1');
    expect(config.message).toContain('微軟課程');
    expect(config.message).toContain('12 筆課程將一併刪除');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](groups[1]);
    expect(navSpy).toHaveBeenCalledWith(['/course-groups', 2, 'edit']);
  });
});
