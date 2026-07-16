import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Observable } from 'rxjs';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';

import {
  FeaturedPromoItem,
  FeaturedPromoItemRequest,
} from '@app/core/models/featured-promo-item.model';
import { PromotionLookup } from '@app/core/models/promotion-lookup.model';
import { FeaturedPromoItemService } from '@app/core/services/featured-promo-item.service';
import { LookupService } from '@app/core/services/lookup.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';

/** The values Copy puts on the board's clipboard and Paste seeds a new form with. */
export interface FeaturedPromoItemSeed {
  promotionPkid: number;
  promoCode: string;
  topic: string;
  description: string;
}

/**
 * The inline Edit/New form the board opens inside a slot row. Editing an existing row
 * passes `item`; New passes none; Paste passes `seed` with the copied values.
 *
 * PromoCode drives the record: the autocomplete resolves it against Promotion2 and sets
 * promotionPkid. Topic/Description are prefilled from the picked promotion but stay
 * editable — the row stores its own copy.
 */
@Component({
  selector: 'app-featured-promo-item-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AutoCompleteModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    RowAuditBadge,
  ],
  templateUrl: './featured-promo-item-form.html',
  styleUrl: './featured-promo-item-form.scss',
})
export class FeaturedPromoItemForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(FeaturedPromoItemService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);

  /** Existing row to edit; absent = New. */
  readonly item = input<FeaturedPromoItem | null>(null);
  /** Copied values to seed a New form with (the board's Paste). */
  readonly seed = input<FeaturedPromoItemSeed | null>(null);
  readonly scheduleOn = input.required<string>();
  readonly trainingCenterPkid = input.required<number>();
  readonly slot = input.required<number>();

  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = signal(false);
  protected readonly suggestions = signal<PromotionLookup[]>([]);
  protected readonly isEdit = computed(() => this.item() !== null);
  // Exposed for the audit badge under its own name: the template has a `#item` autocomplete
  // ng-template that shadows the `item` input, so `item()` is not reachable from the markup.
  protected readonly recordPkid = computed(() => this.item()?.pkid ?? 0);

  /** Set once a PromoCode resolves to a real Promotion2 row; cleared when it is retyped. */
  private readonly promotionPkid = signal<number | null>(null);

  protected readonly form = this.fb.group({
    // Holds a string while typing and a PromotionLookup once one is picked.
    promoCode: this.fb.control<string | PromotionLookup | null>(null, {
      validators: [Validators.required, this.resolvedPromotion()],
    }),
    topic: this.fb.control('', { validators: [Validators.required, Validators.maxLength(100)] }),
    description: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(300)],
    }),
  });

  ngOnInit(): void {
    const existing = this.item();
    const pasted = this.seed();

    if (existing) {
      this.promotionPkid.set(existing.promotionPkid);
      this.form.patchValue({
        promoCode: existing.promoCode,
        topic: existing.topic,
        description: existing.description,
      });
    } else if (pasted) {
      this.promotionPkid.set(pasted.promotionPkid);
      this.form.patchValue({
        promoCode: pasted.promoCode,
        topic: pasted.topic,
        description: pasted.description,
      });
    }
  }

  /**
   * A typed PromoCode only counts once it has resolved to a Promotion_pkid — the column
   * is a NOT NULL FK, so a free-text code that matches nothing must not save.
   */
  private resolvedPromotion() {
    return (control: AbstractControl): ValidationErrors | null =>
      control.value && this.promotionPkid() === null ? { unresolvedPromoCode: true } : null;
  }

  protected searchPromotions(event: AutoCompleteCompleteEvent): void {
    this.lookupService.getPromotions(event.query).subscribe({
      next: (matches) => this.suggestions.set(matches),
      error: () => this.suggestions.set([]),
    });
  }

  /** Picking a code sets Promotion_pkid and prefills Topic/Description (still editable). */
  protected onPromotionSelected(promotion: PromotionLookup): void {
    this.promotionPkid.set(promotion.pkid);
    this.form.patchValue({
      topic: promotion.topic,
      description: promotion.description,
    });
    this.form.controls.promoCode.updateValueAndValidity();
  }

  /** Retyping invalidates the previous resolution until a new code is picked. */
  protected onPromoCodeInput(): void {
    this.promotionPkid.set(null);
    this.form.controls.promoCode.updateValueAndValidity();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const request: FeaturedPromoItemRequest = {
      pkid: this.item()?.pkid ?? 0,
      scheduleOn: this.scheduleOn(),
      trainingCenterPkid: this.trainingCenterPkid(),
      slot: this.slot(),
      promotionPkid: this.promotionPkid()!,
      topic: raw.topic!.trim(),
      description: raw.description!.trim(),
    };

    this.saving.set(true);
    const op$: Observable<unknown> = this.isEdit()
      ? this.service.update(request)
      : this.service.create(request);

    op$.subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.isEdit() ? '更新成功' : '新增成功',
          detail: `上稿「${request.topic}」已儲存。`,
        });
        this.saved.emit();
      },
      error: (err: { status?: number }) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '儲存失敗',
          detail:
            err?.status === 409
              ? '此日期／中心／欄位已有資料。'
              : '儲存上稿資料時發生錯誤。',
        });
      },
    });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  /** p-autoComplete renders this for each suggestion and for the picked value. */
  protected promoCodeOf(promotion: PromotionLookup | string): string {
    return typeof promotion === 'string' ? promotion : promotion.promoCode;
  }
}
