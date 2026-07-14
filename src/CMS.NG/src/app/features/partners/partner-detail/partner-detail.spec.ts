import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { PartnerDetail } from './partner-detail';
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

describe('PartnerDetail', () => {
  let fixture: ComponentFixture<PartnerDetail>;
  let component: PartnerDetail;
  let serviceSpy: jasmine.SpyObj<PartnerService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<PartnerService>('PartnerService', ['getById']);
    serviceSpy.getById.and.returnValue(of(partner));

    await TestBed.configureTestingModule({
      imports: [PartnerDetail],
      providers: [
        { provide: PartnerService, useValue: serviceSpy },
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

    fixture = TestBed.createComponent(PartnerDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the partner by id from the route', () => {
    expect(serviceSpy.getById).toHaveBeenCalledWith(2);
    expect(component['partner']()?.name).toBe('Oracle');
  });

  it('renders partner fields', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Oracle');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/partners', 2, 'edit']);
  });
});
