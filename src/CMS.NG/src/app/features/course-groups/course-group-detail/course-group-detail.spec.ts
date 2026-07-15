import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { CourseGroupDetail } from './course-group-detail';
import { CourseGroupService } from '@app/core/services/course-group.service';
import { CourseGroup } from '@app/core/models/course-group.model';

const courseGroup: CourseGroup = {
  pkid: 2,
  description: '管理類',
};

describe('CourseGroupDetail', () => {
  let fixture: ComponentFixture<CourseGroupDetail>;
  let component: CourseGroupDetail;
  let serviceSpy: jasmine.SpyObj<CourseGroupService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['getById']);
    serviceSpy.getById.and.returnValue(of(courseGroup));

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
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseGroupDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the course group by id from the route', () => {
    expect(serviceSpy.getById).toHaveBeenCalledWith(2);
    expect(component['courseGroup']()?.description).toBe('管理類');
  });

  it('renders course group fields', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('管理類');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/course-groups', 2, 'edit']);
  });
});
