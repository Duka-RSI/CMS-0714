import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { FeaturedPromoItemService } from './featured-promo-item.service';
import {
  FeaturedPromoItem,
  FeaturedPromoItemRequest,
} from '@app/core/models/featured-promo-item.model';

describe('FeaturedPromoItemService', () => {
  let service: FeaturedPromoItemService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/featured-promo-items`;

  const sample: FeaturedPromoItem = {
    pkid: 1,
    scheduleOn: '2026-03-16',
    trainingCenterPkid: 1,
    slot: 1,
    promotionPkid: 100,
    topic: '成為能AI協作的程式設計師',
    description: '轉職就業養成班，三大主流語言任你選',
    promoCode: '20251204_SkillTrainAI',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FeaturedPromoItemService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeaturedPromoItemService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll() issues GET /featured-promo-items', () => {
    service.getAll().subscribe((res) => expect(res).toEqual([sample]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);
  });

  it('query() POSTs the week and training centre to /query', () => {
    service
      .query({ weekStart: '2026-03-16', trainingCenterPkid: 1 })
      .subscribe((res) => expect(res.length).toBe(1));
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ weekStart: '2026-03-16', trainingCenterPkid: 1 });
    req.flush([sample]);
  });

  it('query() sends a null training centre to mean "every centre"', () => {
    service.query({ weekStart: '2026-03-16', trainingCenterPkid: null }).subscribe();
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.body.trainingCenterPkid).toBeNull();
    req.flush([]);
  });

  it('getById() issues GET /featured-promo-items/{id}', () => {
    service.getById(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create() POSTs the request to /featured-promo-items', () => {
    const request: FeaturedPromoItemRequest = {
      pkid: 0,
      scheduleOn: '2026-03-17',
      trainingCenterPkid: 1,
      slot: 2,
      promotionPkid: 101,
      topic: 'Google AI工具一次掌握',
      description: '不需技術基礎！最新Google AI實戰課程',
    };
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sample, pkid: 5 });
  });

  it('update() PUTs the request to /featured-promo-items', () => {
    const request: FeaturedPromoItemRequest = {
      pkid: 1,
      scheduleOn: sample.scheduleOn,
      trainingCenterPkid: sample.trainingCenterPkid,
      slot: sample.slot,
      promotionPkid: sample.promotionPkid,
      topic: sample.topic,
      description: sample.description,
    };
    service.update(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('moveSlot() POSTs the target slot to /move-slot', () => {
    service.moveSlot({ pkid: 1, targetSlot: 2 }).subscribe();
    const req = httpMock.expectOne(`${base}/move-slot`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ pkid: 1, targetSlot: 2 });
    req.flush(null);
  });

  it('delete() issues DELETE /featured-promo-items/{id}', () => {
    service.delete(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
