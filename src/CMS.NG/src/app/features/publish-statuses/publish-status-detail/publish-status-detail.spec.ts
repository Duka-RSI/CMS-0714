import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { PublishStatusDetail } from './publish-status-detail';
import { PublishStatusService } from '@app/core/services/publish-status.service';
import { PublishStatus } from '@app/core/models/publish-status.model';

const status: PublishStatus = {
  pkid: 2,
  description: '已發布',
  isDraft: false,
  isPublished: true,
  isDiscontinued: false,
};

describe('PublishStatusDetail', () => {
  let fixture: ComponentFixture<PublishStatusDetail>;
  let component: PublishStatusDetail;
  let serviceSpy: jasmine.SpyObj<PublishStatusService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['getById']);
    serviceSpy.getById.and.returnValue(of(status));

    await TestBed.configureTestingModule({
      imports: [PublishStatusDetail],
      providers: [
        { provide: PublishStatusService, useValue: serviceSpy },
        MessageService,
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishStatusDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the status by id from the route', () => {
    expect(serviceSpy.getById).toHaveBeenCalledWith(2);
    expect(component['status']()?.description).toBe('已發布');
  });

  it('renders status fields', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('已發布');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/publish-statuses', 2, 'edit']);
  });
});
