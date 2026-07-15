import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { CourseGroupDetail } from './course-group-detail';
import { CourseGroupService } from '@app/core/services/course-group.service';
import { CourseGroup } from '@app/core/models/course-group.model';

const group: CourseGroup = {
  pkid: 1,
  description: '微軟課程',
  courseCount: 12,
  partnerCourseGroupCount: 2,
};

describe('CourseGroupDetail', () => {
  let fixture: ComponentFixture<CourseGroupDetail>;
  let component: CourseGroupDetail;
  let serviceSpy: jasmine.SpyObj<CourseGroupService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['getById']);
    serviceSpy.getById.and.returnValue(of(group));

    await TestBed.configureTestingModule({
      imports: [CourseGroupDetail],
      providers: [
        { provide: CourseGroupService, useValue: serviceSpy },
        MessageService,
        provideRouter([]),
        provideNoopAnimations(),
        // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseGroupDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the group by numeric id from the route', () => {
    expect(serviceSpy.getById).toHaveBeenCalledWith(1);
    expect(component['group']()?.description).toBe('微軟課程');
  });

  it('renders group fields including counts', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('微軟課程');
    expect(text).toContain('12');
    expect(text).toContain('2');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/course-groups', 1, 'edit']);
  });
});
