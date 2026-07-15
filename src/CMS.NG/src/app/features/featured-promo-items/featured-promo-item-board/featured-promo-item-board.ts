import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

import { FeaturedPromoItem } from '@app/core/models/featured-promo-item.model';
import { TrainingCenterLookup } from '@app/core/models/training-center-lookup.model';
import { FeaturedPromoItemService } from '@app/core/services/featured-promo-item.service';
import { LookupService } from '@app/core/services/lookup.service';
import {
  addDays,
  formatDayLabel,
  formatShortDate,
  fromIsoDate,
  mondayOf,
  toIsoDate,
} from '@app/core/utils/week.util';
import {
  FeaturedPromoItemForm,
  FeaturedPromoItemSeed,
} from '../featured-promo-item-form/featured-promo-item-form';

const CENTER_KEY = 'featured-promo-item-center';
const WEEK_KEY = 'featured-promo-item-week';

/** Board slots, fixed at 1–3 per the spec. */
const SLOTS = [1, 2, 3] as const;

/** One slot row: the item that fills it, or null when the slot is empty. */
interface SlotCell {
  slot: number;
  item: FeaturedPromoItem | null;
}

interface DayGroup {
  /** 'YYYY-MM-DD' — the ScheduleOn value rows in this group get. */
  isoDate: string;
  /** '3/16 (一)'. */
  label: string;
  cells: SlotCell[];
}

/** Identifies the one cell currently showing the inline form. */
interface EditTarget {
  isoDate: string;
  slot: number;
  /** True when Paste opened the form, so the clipboard seeds it. */
  fromPaste: boolean;
}

/**
 * The 上稿作業 board: a TrainingCenter tab strip over a Monday–Sunday week, each day
 * showing three slots. Rows are edited inline rather than on a separate page.
 */
@Component({
  selector: 'app-featured-promo-item-board',
  imports: [CommonModule, TabsModule, ButtonModule, TooltipModule, FeaturedPromoItemForm],
  templateUrl: './featured-promo-item-board.html',
  styleUrl: './featured-promo-item-board.scss',
})
export class FeaturedPromoItemBoard implements OnInit {
  private readonly service = inject(FeaturedPromoItemService);
  private readonly lookupService = inject(LookupService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly centers = signal<TrainingCenterLookup[]>([]);
  protected readonly activeCenterPkid = signal<number | null>(null);
  protected readonly weekStart = signal<Date>(mondayOf(new Date()));
  protected readonly items = signal<FeaturedPromoItem[]>([]);
  protected readonly loading = signal(false);

  /** Copy target; survives week and tab changes so rows can be pasted anywhere. */
  protected readonly clipboard = signal<FeaturedPromoItemSeed | null>(null);
  protected readonly editing = signal<EditTarget | null>(null);

  protected readonly slots = SLOTS;

  /** '3/16 -- 3/22' for the week navigator. */
  protected readonly weekLabel = computed(() => {
    const start = this.weekStart();
    return `${formatShortDate(start)} -- ${formatShortDate(addDays(start, 6))}`;
  });

  /** The 7 day groups, each with its 3 slot cells filled in from `items`. */
  protected readonly days = computed<DayGroup[]>(() => {
    const start = this.weekStart();
    const byCell = new Map<string, FeaturedPromoItem>();
    for (const item of this.items()) {
      byCell.set(`${item.scheduleOn}#${item.slot}`, item);
    }

    return Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(start, offset);
      const isoDate = toIsoDate(date);
      return {
        isoDate,
        label: formatDayLabel(date),
        cells: SLOTS.map((slot) => ({ slot, item: byCell.get(`${isoDate}#${slot}`) ?? null })),
      };
    });
  });

  ngOnInit(): void {
    this.restoreState();
    this.loadCenters();
  }

  private restoreState(): void {
    const savedWeek = sessionStorage.getItem(WEEK_KEY);
    if (savedWeek) {
      this.weekStart.set(mondayOf(fromIsoDate(savedWeek)));
    }
    const savedCenter = sessionStorage.getItem(CENTER_KEY);
    if (savedCenter) {
      this.activeCenterPkid.set(Number(savedCenter));
    }
  }

  private loadCenters(): void {
    this.lookupService.getTrainingCenters().subscribe({
      next: (centers) => {
        this.centers.set(centers);
        // Fall back to the first tab when nothing is stored, or the stored centre is gone.
        const stored = this.activeCenterPkid();
        const valid = stored !== null && centers.some((c) => c.pkid === stored);
        if (!valid) {
          this.activeCenterPkid.set(centers[0]?.pkid ?? null);
        }
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得訓練中心清單。',
        });
      },
    });
  }

  load(): void {
    const center = this.activeCenterPkid();
    if (center === null) {
      this.items.set([]);
      return;
    }

    this.loading.set(true);
    this.service
      .query({ weekStart: toIsoDate(this.weekStart()), trainingCenterPkid: center })
      .subscribe({
        next: (data) => {
          this.items.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: '載入失敗',
            detail: '無法取得上稿清單。',
          });
        },
      });
  }

  // ----- tab strip -----
  protected selectCenter(pkid: unknown): void {
    const value = Number(pkid);
    if (Number.isNaN(value) || value === this.activeCenterPkid()) {
      return;
    }
    this.activeCenterPkid.set(value);
    sessionStorage.setItem(CENTER_KEY, String(value));
    this.editing.set(null);
    this.load();
  }

  // ----- week navigator -----
  protected previousWeek(): void {
    this.shiftWeek(-7);
  }

  protected nextWeek(): void {
    this.shiftWeek(7);
  }

  private shiftWeek(days: number): void {
    const next = addDays(this.weekStart(), days);
    this.weekStart.set(next);
    sessionStorage.setItem(WEEK_KEY, toIsoDate(next));
    this.editing.set(null);
    this.load();
  }

  // ----- inline form -----
  protected isEditing(isoDate: string, slot: number): boolean {
    const target = this.editing();
    return target?.isoDate === isoDate && target.slot === slot;
  }

  protected startEdit(isoDate: string, slot: number): void {
    this.editing.set({ isoDate, slot, fromPaste: false });
  }

  protected startPaste(isoDate: string, slot: number): void {
    if (!this.clipboard()) {
      return;
    }
    this.editing.set({ isoDate, slot, fromPaste: true });
  }

  /** The seed handed to the form — only when Paste opened it on an empty cell. */
  protected seedFor(isoDate: string, slot: number): FeaturedPromoItemSeed | null {
    const target = this.editing();
    return target?.isoDate === isoDate && target.slot === slot && target.fromPaste
      ? this.clipboard()
      : null;
  }

  protected onSaved(): void {
    this.editing.set(null);
    this.load();
  }

  protected onCancelled(): void {
    this.editing.set(null);
  }

  // ----- row actions -----
  protected copy(item: FeaturedPromoItem): void {
    this.clipboard.set({
      promotionPkid: item.promotionPkid,
      promoCode: item.promoCode,
      topic: item.topic,
      description: item.description,
    });
    this.messageService.add({
      severity: 'info',
      summary: '已複製',
      detail: `「${item.promoCode}」已複製，可貼上到空欄位。`,
    });
  }

  /** + moves a row down a slot (1 → 2); − moves it up (2 → 1). */
  protected moveSlot(item: FeaturedPromoItem, delta: number): void {
    const targetSlot = item.slot + delta;
    if (targetSlot < SLOTS[0] || targetSlot > SLOTS[SLOTS.length - 1]) {
      return;
    }

    this.service.moveSlot({ pkid: item.pkid, targetSlot }).subscribe({
      next: () => this.load(),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '移動失敗',
          detail: '調整欄位順序時發生錯誤。',
        });
      },
    });
  }

  protected canMoveUp(item: FeaturedPromoItem): boolean {
    return item.slot > SLOTS[0];
  }

  protected canMoveDown(item: FeaturedPromoItem): boolean {
    return item.slot < SLOTS[SLOTS.length - 1];
  }

  protected confirmDelete(item: FeaturedPromoItem): void {
    this.confirmationService.confirm({
      header: '刪除確認',
      message: `確定要刪除「${item.promoCode}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(item),
    });
  }

  private delete(item: FeaturedPromoItem): void {
    this.service.delete(item.pkid).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '刪除成功',
          detail: `上稿「${item.promoCode}」已刪除。`,
        });
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '刪除失敗',
          detail: '刪除上稿資料時發生錯誤。',
        });
      },
    });
  }
}
