import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';

import { FeaturedPromoItemForm } from './featured-promo-item-form';
import { FeaturedPromoItemService } from '@app/core/services/featured-promo-item.service';
import { LookupService } from '@app/core/services/lookup.service';
import { FeaturedPromoItem } from '@app/core/models/featured-promo-item.model';
import { PromotionLookup } from '@app/core/models/promotion-lookup.model';

describe('FeaturedPromoItemForm', () => {
  let fixture: ComponentFixture<FeaturedPromoItemForm>;
  let component: FeaturedPromoItemForm;
  let serviceSpy: jasmine.SpyObj<FeaturedPromoItemService>;
  let lookupSpy: jasmine.SpyObj<LookupService>;

  const promotion: PromotionLookup = {
    pkid: 100,
    promoCode: '20251204_SkillTrainAI',
    topic: '成為能AI協作的程式設計師',
    description: '轉職就業養成班，三大主流語言任你選',
  };

  const existing: FeaturedPromoItem = {
    pkid: 11,
    scheduleOn: '2026-03-16',
    trainingCenterPkid: 1,
    slot: 1,
    promotionPkid: 100,
    topic: '成為能AI協作的程式設計師',
    description: '轉職就業養成班，三大主流語言任你選',
    promoCode: '20251204_SkillTrainAI',
  };

  /**
   * Simulate picking a suggestion, the way p-autoComplete does it: its ControlValueAccessor
   * writes the picked object into the control, then (onSelect) fires.
   */
  function pickPromotion(picked: PromotionLookup = promotion) {
    component['form'].controls.promoCode.setValue(picked);
    component['onPromotionSelected'](picked);
  }

  /** Build the form with the given inputs, mirroring how the board embeds it. */
  async function build(inputs: Record<string, unknown> = {}) {
    fixture = TestBed.createComponent(FeaturedPromoItemForm);
    fixture.componentRef.setInput('scheduleOn', '2026-03-16');
    fixture.componentRef.setInput('trainingCenterPkid', 1);
    fixture.componentRef.setInput('slot', 1);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<FeaturedPromoItemService>('FeaturedPromoItemService', [
      'create',
      'update',
    ]);
    serviceSpy.create.and.returnValue(of(existing));
    serviceSpy.update.and.returnValue(of(void 0));

    lookupSpy = jasmine.createSpyObj<LookupService>('LookupService', ['getPromotions']);
    lookupSpy.getPromotions.and.returnValue(of([promotion]));

    await TestBed.configureTestingModule({
      imports: [FeaturedPromoItemForm],
      providers: [
        { provide: FeaturedPromoItemService, useValue: serviceSpy },
        { provide: LookupService, useValue: lookupSpy },
        MessageService,
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  // ----- New -----

  describe('New', () => {
    beforeEach(() => build());

    it('starts empty and in create mode', () => {
      expect(component['isEdit']()).toBeFalse();
      expect(component['form'].controls.promoCode.value).toBeNull();
      expect(component['form'].controls.topic.value).toBe('');
      expect(component['form'].controls.description.value).toBe('');
    });

    it('is invalid while empty and does not call the API', () => {
      expect(component['form'].invalid).toBeTrue();
      component['save']();
      expect(serviceSpy.create).not.toHaveBeenCalled();
    });

    it('queries the PromoCode lookup as the user types', () => {
      component['searchPromotions']({ query: 'Skill', originalEvent: new Event('input') });
      expect(lookupSpy.getPromotions).toHaveBeenCalledWith('Skill');
      expect(component['suggestions']()).toEqual([promotion]);
    });

    it('picking a PromoCode prefills Topic and Description from the promotion', () => {
      pickPromotion();

      expect(component['form'].controls.topic.value).toBe('成為能AI協作的程式設計師');
      expect(component['form'].controls.description.value).toBe(
        '轉職就業養成班，三大主流語言任你選',
      );
    });

    it('leaves the prefilled Topic and Description editable', () => {
      pickPromotion();
      component['form'].patchValue({ topic: '自訂標題', description: '自訂說明' });
      component['save']();

      expect(serviceSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ topic: '自訂標題', description: '自訂說明' }),
      );
    });

    it('a typed-but-unresolved PromoCode keeps the form invalid', () => {
      component['form'].controls.promoCode.setValue('does-not-exist');
      component['onPromoCodeInput']();

      expect(component['form'].controls.promoCode.hasError('unresolvedPromoCode')).toBeTrue();
      component['save']();
      expect(serviceSpy.create).not.toHaveBeenCalled();
    });

    it('resolving a PromoCode clears the unresolved error', () => {
      component['form'].controls.promoCode.setValue('2025');
      component['onPromoCodeInput']();
      expect(component['form'].controls.promoCode.hasError('unresolvedPromoCode')).toBeTrue();

      pickPromotion();

      expect(component['form'].controls.promoCode.hasError('unresolvedPromoCode')).toBeFalse();
    });

    it('retyping after a pick invalidates the resolved promotion again', () => {
      pickPromotion();
      component['form'].controls.promoCode.setValue('2025120');
      component['onPromoCodeInput']();

      expect(component['form'].controls.promoCode.hasError('unresolvedPromoCode')).toBeTrue();
    });

    it('creates the row with the cell coordinates the board handed in', () => {
      pickPromotion();
      component['save']();

      expect(serviceSpy.create).toHaveBeenCalledWith({
        pkid: 0,
        scheduleOn: '2026-03-16',
        trainingCenterPkid: 1,
        slot: 1,
        promotionPkid: 100,
        topic: '成為能AI協作的程式設計師',
        description: '轉職就業養成班，三大主流語言任你選',
      });
    });

    it('emits saved once the create succeeds', () => {
      const saved = spyOn(component.saved, 'emit');
      pickPromotion();
      component['save']();

      expect(saved).toHaveBeenCalled();
    });

    it('trims Topic and Description before saving', () => {
      pickPromotion();
      component['form'].patchValue({ topic: '  標題  ', description: '  說明  ' });
      component['save']();

      expect(serviceSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ topic: '標題', description: '說明' }),
      );
    });
  });

  // ----- Paste (New seeded from the clipboard) -----

  describe('New from Paste', () => {
    beforeEach(() =>
      build({
        seed: {
          promotionPkid: 101,
          promoCode: '251211_GoogleAI',
          topic: 'Google AI工具一次掌握',
          description: '不需技術基礎',
        },
      }),
    );

    it('opens prefilled with the copied values but still in create mode', () => {
      expect(component['isEdit']()).toBeFalse();
      expect(component['form'].controls.promoCode.value).toBe('251211_GoogleAI');
      expect(component['form'].controls.topic.value).toBe('Google AI工具一次掌握');
    });

    it('is valid immediately — the copied PromoCode is already resolved', () => {
      expect(component['form'].valid).toBeTrue();
    });

    it('creates a new row at the pasted-into cell, carrying the copied promotion', () => {
      component['save']();
      expect(serviceSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ pkid: 0, promotionPkid: 101, scheduleOn: '2026-03-16', slot: 1 }),
      );
    });
  });

  // ----- Edit -----

  describe('Edit', () => {
    beforeEach(() => build({ item: existing }));

    it('opens in edit mode with the existing values', () => {
      expect(component['isEdit']()).toBeTrue();
      expect(component['form'].controls.promoCode.value).toBe('20251204_SkillTrainAI');
      expect(component['form'].controls.topic.value).toBe('成為能AI協作的程式設計師');
      expect(component['form'].valid).toBeTrue();
    });

    it('updates rather than creates, keeping the row pkid', () => {
      component['form'].patchValue({ topic: '改過的標題' });
      component['save']();

      expect(serviceSpy.update).toHaveBeenCalledWith(
        jasmine.objectContaining({ pkid: 11, topic: '改過的標題' }),
      );
      expect(serviceSpy.create).not.toHaveBeenCalled();
    });

    it('emits saved once the update succeeds', () => {
      const saved = spyOn(component.saved, 'emit');
      component['save']();
      expect(saved).toHaveBeenCalled();
    });

    it('reports the slot clash when the API answers 409', () => {
      const messageService = TestBed.inject(MessageService);
      const addSpy = spyOn(messageService, 'add');
      serviceSpy.update.and.returnValue(throwError(() => ({ status: 409 })));

      component['save']();

      expect(addSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ severity: 'error', detail: '此日期／中心／欄位已有資料。' }),
      );
    });

    it('reports a generic error for any other failure', () => {
      const messageService = TestBed.inject(MessageService);
      const addSpy = spyOn(messageService, 'add');
      serviceSpy.update.and.returnValue(throwError(() => ({ status: 500 })));

      component['save']();

      expect(addSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ severity: 'error', detail: '儲存上稿資料時發生錯誤。' }),
      );
      expect(component['saving']()).toBeFalse();
    });

    it('Cancel emits cancelled without touching the API', () => {
      const cancelled = spyOn(component.cancelled, 'emit');
      component['cancel']();

      expect(cancelled).toHaveBeenCalled();
      expect(serviceSpy.update).not.toHaveBeenCalled();
    });
  });
});
