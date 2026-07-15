import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { Confirmation, ConfirmationService, MessageService } from 'primeng/api';

import { FeaturedPromoItemBoard } from './featured-promo-item-board';
import { FeaturedPromoItemService } from '@app/core/services/featured-promo-item.service';
import { LookupService } from '@app/core/services/lookup.service';
import { FeaturedPromoItem } from '@app/core/models/featured-promo-item.model';
import { TrainingCenterLookup } from '@app/core/models/training-center-lookup.model';
import { toIsoDate, mondayOf } from '@app/core/utils/week.util';

describe('FeaturedPromoItemBoard', () => {
  let fixture: ComponentFixture<FeaturedPromoItemBoard>;
  let component: FeaturedPromoItemBoard;
  let serviceSpy: jasmine.SpyObj<FeaturedPromoItemService>;
  let lookupSpy: jasmine.SpyObj<LookupService>;

  const centers: TrainingCenterLookup[] = [
    { pkid: 1, name: '台北' },
    { pkid: 2, name: '新竹' },
    { pkid: 3, name: '台中' },
  ];

  const items: FeaturedPromoItem[] = [
    {
      pkid: 11,
      scheduleOn: '2026-03-16',
      trainingCenterPkid: 1,
      slot: 1,
      promotionPkid: 100,
      topic: '成為能AI協作的程式設計師',
      description: '轉職就業養成班',
      promoCode: '20251204_SkillTrainAI',
    },
    {
      pkid: 12,
      scheduleOn: '2026-03-16',
      trainingCenterPkid: 1,
      slot: 2,
      promotionPkid: 101,
      topic: 'Google AI工具一次掌握',
      description: '不需技術基礎',
      promoCode: '251211_GoogleAI',
    },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<FeaturedPromoItemService>('FeaturedPromoItemService', [
      'query',
      'delete',
      'moveSlot',
    ]);
    // Fresh copies per call — the component maps over these and must not mutate the fixture.
    serviceSpy.query.and.returnValue(of([...items]));
    serviceSpy.delete.and.returnValue(of(void 0));
    serviceSpy.moveSlot.and.returnValue(of(void 0));

    lookupSpy = jasmine.createSpyObj<LookupService>('LookupService', ['getTrainingCenters']);
    lookupSpy.getTrainingCenters.and.returnValue(of([...centers]));

    await TestBed.configureTestingModule({
      imports: [FeaturedPromoItemBoard],
      providers: [
        { provide: FeaturedPromoItemService, useValue: serviceSpy },
        { provide: LookupService, useValue: lookupSpy },
        MessageService,
        ConfirmationService,
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(FeaturedPromoItemBoard);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit -> loadCenters() -> load()
  });

  // ----- init -----

  it('creates, loads the training centres and defaults to the first tab', () => {
    expect(component).toBeTruthy();
    expect(lookupSpy.getTrainingCenters).toHaveBeenCalledTimes(1);
    expect(component['centers']().length).toBe(3);
    expect(component['activeCenterPkid']()).toBe(1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
  });

  it('renders a tab per training centre', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('台北');
    expect(text).toContain('新竹');
    expect(text).toContain('台中');
  });

  it('defaults to the current week, starting on Monday', () => {
    expect(toIsoDate(component['weekStart']())).toBe(toIsoDate(mondayOf(new Date())));
  });

  // ----- one-week grid -----

  it('always renders exactly 7 day groups with 3 slots each', () => {
    const days = component['days']();
    expect(days.length).toBe(7);
    expect(days.every((d) => d.cells.length === 3)).toBeTrue();
  });

  it('places each loaded item into its own day/slot cell and leaves the rest empty', () => {
    // The fixture rows are dated 3/16; point the board at that week to see them.
    component['weekStart'].set(new Date(2026, 2, 16));
    fixture.detectChanges();

    const monday = component['days']().find((d) => d.isoDate === '2026-03-16');
    expect(monday).toBeTruthy();
    expect(monday!.cells[0].item?.promoCode).toBe('20251204_SkillTrainAI');
    expect(monday!.cells[1].item?.promoCode).toBe('251211_GoogleAI');
    expect(monday!.cells[2].item).toBeNull();
  });

  it('labels day groups as M/D (weekday)', () => {
    component['weekStart'].set(new Date(2026, 2, 16));
    fixture.detectChanges();
    const labels = component['days']().map((d) => d.label);
    expect(labels[0]).toBe('3/16 (一)');
    expect(labels[6]).toBe('3/22 (日)');
  });

  it('shows the Monday–Sunday span in the week navigator', () => {
    component['weekStart'].set(new Date(2026, 2, 16));
    fixture.detectChanges();
    expect(component['weekLabel']()).toBe('3/16 -- 3/22');
  });

  // ----- TrainingCenter tab filter -----

  it('selectCenter re-queries with the picked centre and persists it', () => {
    component['selectCenter'](2);

    expect(component['activeCenterPkid']()).toBe(2);
    expect(sessionStorage.getItem('featured-promo-item-center')).toBe('2');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
    expect(serviceSpy.query.calls.mostRecent().args[0].trainingCenterPkid).toBe(2);
  });

  it('selectCenter ignores a click on the tab that is already active', () => {
    component['selectCenter'](1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
  });

  // ----- one-week ScheduleOn filter -----

  it('nextWeek advances the query by 7 days and persists the week', () => {
    component['weekStart'].set(new Date(2026, 2, 16));
    component['nextWeek']();

    expect(toIsoDate(component['weekStart']())).toBe('2026-03-23');
    expect(serviceSpy.query.calls.mostRecent().args[0].weekStart).toBe('2026-03-23');
    expect(sessionStorage.getItem('featured-promo-item-week')).toBe('2026-03-23');
  });

  it('previousWeek rewinds the query by 7 days', () => {
    component['weekStart'].set(new Date(2026, 2, 16));
    component['previousWeek']();

    expect(toIsoDate(component['weekStart']())).toBe('2026-03-09');
    expect(serviceSpy.query.calls.mostRecent().args[0].weekStart).toBe('2026-03-09');
  });

  it('restores the persisted week and centre on init, snapping the week to Monday', async () => {
    sessionStorage.setItem('featured-promo-item-week', '2026-03-19'); // a Thursday
    sessionStorage.setItem('featured-promo-item-center', '3');

    const restored = TestBed.createComponent(FeaturedPromoItemBoard);
    restored.detectChanges();

    expect(toIsoDate(restored.componentInstance['weekStart']())).toBe('2026-03-16');
    expect(restored.componentInstance['activeCenterPkid']()).toBe(3);
  });

  it('falls back to the first tab when the persisted centre no longer exists', () => {
    sessionStorage.setItem('featured-promo-item-center', '999');

    const restored = TestBed.createComponent(FeaturedPromoItemBoard);
    restored.detectChanges();

    expect(restored.componentInstance['activeCenterPkid']()).toBe(1);
  });

  // ----- slot move (+ / −) -----

  it('+ asks the API to move the row down one slot', () => {
    component['moveSlot'](items[0], 1);
    expect(serviceSpy.moveSlot).toHaveBeenCalledWith({ pkid: 11, targetSlot: 2 });
  });

  it('− asks the API to move the row up one slot', () => {
    component['moveSlot'](items[1], -1);
    expect(serviceSpy.moveSlot).toHaveBeenCalledWith({ pkid: 12, targetSlot: 1 });
  });

  it('refuses to move past the ends of the 1–3 slot range', () => {
    component['moveSlot']({ ...items[0], slot: 1 }, -1); // above slot 1
    component['moveSlot']({ ...items[0], slot: 3 }, 1); // below slot 3
    expect(serviceSpy.moveSlot).not.toHaveBeenCalled();
  });

  it('disables the move links at the ends of the range', () => {
    expect(component['canMoveUp']({ ...items[0], slot: 1 })).toBeFalse();
    expect(component['canMoveDown']({ ...items[0], slot: 3 })).toBeFalse();
    expect(component['canMoveDown']({ ...items[0], slot: 1 })).toBeTrue();
    expect(component['canMoveUp']({ ...items[0], slot: 3 })).toBeTrue();
  });

  it('reloads the board after a successful move', () => {
    component['moveSlot'](items[0], 1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  // ----- copy / paste -----

  it('Copy puts the row values on the clipboard', () => {
    component['copy'](items[0]);
    expect(component['clipboard']()).toEqual({
      promotionPkid: 100,
      promoCode: '20251204_SkillTrainAI',
      topic: '成為能AI協作的程式設計師',
      description: '轉職就業養成班',
    });
  });

  it('Paste is a no-op while the clipboard is empty', () => {
    component['startPaste']('2026-03-16', 3);
    expect(component['editing']()).toBeNull();
  });

  it('Paste opens the form on the empty cell and seeds it with the copied values', () => {
    component['copy'](items[0]);
    component['startPaste']('2026-03-16', 3);

    expect(component['isEditing']('2026-03-16', 3)).toBeTrue();
    expect(component['seedFor']('2026-03-16', 3)?.promoCode).toBe('20251204_SkillTrainAI');
  });

  it('Edit opens the form without a seed, so it shows the row as-is', () => {
    component['copy'](items[0]);
    component['startEdit']('2026-03-16', 1);

    expect(component['isEditing']('2026-03-16', 1)).toBeTrue();
    expect(component['seedFor']('2026-03-16', 1)).toBeNull();
  });

  it('only the targeted cell enters edit mode', () => {
    component['startEdit']('2026-03-16', 1);
    expect(component['isEditing']('2026-03-16', 2)).toBeFalse();
    expect(component['isEditing']('2026-03-17', 1)).toBeFalse();
  });

  it('closes the open form when the week or tab changes', () => {
    component['startEdit']('2026-03-16', 1);
    component['nextWeek']();
    expect(component['editing']()).toBeNull();

    component['startEdit']('2026-03-16', 1);
    component['selectCenter'](2);
    expect(component['editing']()).toBeNull();
  });

  it('closes the form and reloads once it reports a save', () => {
    component['startEdit']('2026-03-16', 1);
    component['onSaved']();
    expect(component['editing']()).toBeNull();
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('closes the form without reloading when it is cancelled', () => {
    component['startEdit']('2026-03-16', 1);
    component['onCancelled']();
    expect(component['editing']()).toBeNull();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
  });

  // ----- delete -----

  it('Delete asks for confirmation, then deletes and reloads', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept!();
      return confirmationService;
    });

    component['confirmDelete'](items[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith(11);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('does not delete when the confirmation is dismissed', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.returnValue(confirmationService);

    component['confirmDelete'](items[0]);

    expect(serviceSpy.delete).not.toHaveBeenCalled();
  });

  // ----- errors -----

  it('surfaces a message and stops loading when the query fails', () => {
    const messageService = TestBed.inject(MessageService);
    const addSpy = spyOn(messageService, 'add');
    serviceSpy.query.and.returnValue(throwError(() => new Error('boom')));

    component['load']();

    expect(component['loading']()).toBeFalse();
    expect(addSpy).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
  });
});
