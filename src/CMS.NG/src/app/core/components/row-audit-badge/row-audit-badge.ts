import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { RowAuditHistoryItem } from '@app/core/models/row-audit.model';
import { RowAuditService } from '@app/core/services/row-audit.service';

/** p-tag severity per ActionType, so Insert/Update/Delete read at a glance. */
export function actionSeverity(actionType: string): 'success' | 'info' | 'danger' | 'secondary' {
  switch (actionType) {
    case 'Insert':
      return 'success';
    case 'Update':
      return 'info';
    case 'Delete':
      return 'danger';
    default:
      return 'secondary';
  }
}

/**
 * Reusable audit-history badge for a single record. Drop it in a detail/form page's action
 * bar with the page's table name and the record's pkid:
 *
 *   <app-row-audit-badge tableName="Course" [pkid]="course().pkid" />
 *
 * It fetches the record's history on load, shows the most recent change inline on the badge,
 * and opens a dialog with the full trail (newest first) when clicked. A record with no
 * history — including an unsaved one, where pkid is falsy and no request is made — shows a
 * neutral "no history" state instead.
 *
 * **Compact mode** (`compact` input) is for repeated hosts — list rows, board cells — where
 * one eager fetch per row would turn a page load into N requests. It renders only a small
 * icon button and fetches lazily, on click, fresh each time the dialog opens:
 *
 *   <app-row-audit-badge [compact]="true" tableName="Course" [pkid]="row.pkid" />
 */
@Component({
  selector: 'app-row-audit-badge',
  imports: [CommonModule, ButtonModule, DialogModule, TableModule, TagModule, TooltipModule],
  templateUrl: './row-audit-badge.html',
  styleUrl: './row-audit-badge.scss',
})
export class RowAuditBadge {
  private readonly service = inject(RowAuditService);

  readonly tableName = input.required<string>();
  /** Number (IDENTITY / user-assigned) or string (e.g. AppRole.RoleId) PK. */
  readonly pkid = input.required<string | number>();
  /** Icon-only, fetch-on-click variant for list rows and board cells. */
  readonly compact = input(false);

  protected readonly history = signal<RowAuditHistoryItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly dialogVisible = signal(false);

  /** Newest row (the endpoint returns newest first), or null when there is no history. */
  protected readonly latest = computed<RowAuditHistoryItem | null>(() => this.history()[0] ?? null);

  protected readonly actionSeverity = actionSeverity;

  constructor() {
    // Refetch whenever the target record changes; skip while there is no saved record yet.
    // Compact hosts opt out of the eager fetch — they load on click instead.
    effect(() => {
      const tableName = this.tableName();
      const pkid = this.pkid();
      if (this.compact()) {
        return;
      }
      this.load(tableName, pkid);
    });
  }

  private load(tableName: string, pkid: string | number): void {
    // An unsaved record (pkid 0 / '' / null) has no history and nothing to query.
    if (!tableName || pkid === 0 || pkid === '' || pkid === null || pkid === undefined) {
      this.history.set([]);
      this.loading.set(false);
      this.failed.set(false);
      return;
    }

    this.loading.set(true);
    this.failed.set(false);
    this.service.getHistory(tableName, pkid).subscribe({
      next: (rows) => {
        this.history.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.history.set([]);
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  protected openDialog(): void {
    // Compact mode deferred the fetch to now — and refetches per open, since a list row can
    // be inline-edited between opens and a stale trail would be worse than a second GET.
    if (this.compact()) {
      this.load(this.tableName(), this.pkid());
    }
    this.dialogVisible.set(true);
  }
}
