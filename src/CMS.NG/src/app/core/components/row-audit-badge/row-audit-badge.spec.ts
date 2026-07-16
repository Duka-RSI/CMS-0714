import { ComponentFixture, TestBed } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';

import { RowAuditBadge, actionSeverity } from './row-audit-badge';
import { RowAuditHistoryItem } from '@app/core/models/row-audit.model';

/**
 * The rendered local-time string for a stored UTC datetime, computed the same way the
 * template does (append 'Z', then the date pipe) so the assertion holds in any runner
 * timezone rather than assuming UTC+8.
 */
function renderedTime(dateTime: string, format: string): string {
  return formatDate(dateTime + 'Z', format, 'en-US');
}

describe('RowAuditBadge', () => {
  let fixture: ComponentFixture<RowAuditBadge>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/row-audits`;

  const trail: RowAuditHistoryItem[] = [
    // Newest first, as the endpoint returns them.
    { dateTime: '2026-06-06T09:00:00', userName: 'carol', actionType: 'Delete', actionDesc: '課程' },
    { dateTime: '2026-06-05T09:00:00', userName: 'bob', actionType: 'Update', actionDesc: 'Title, DisplayOrder' },
    { dateTime: '2026-06-04T09:00:00', userName: 'alice', actionType: 'Insert', actionDesc: '課程' },
  ];

  /** Render with the given inputs and flush the (optional) history request. */
  function build(tableName: string, pkid: string | number, rows: RowAuditHistoryItem[] | null = trail) {
    fixture = TestBed.createComponent(RowAuditBadge);
    fixture.componentRef.setInput('tableName', tableName);
    fixture.componentRef.setInput('pkid', pkid);
    fixture.detectChanges(); // runs the effect → fires the GET (unless pkid is falsy)

    if (rows !== null) {
      const req = httpMock.expectOne((r) => r.url === base);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('tableName')).toBe(tableName);
      expect(req.request.params.get('pkid')).toBe(String(pkid));
      req.flush(rows);
      fixture.detectChanges();
    }
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RowAuditBadge],
      providers: [provideNoopAnimations(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ----- severity mapping -----

  it('maps each ActionType to a tag severity', () => {
    expect(actionSeverity('Insert')).toBe('success');
    expect(actionSeverity('Update')).toBe('info');
    expect(actionSeverity('Delete')).toBe('danger');
    expect(actionSeverity('anything else')).toBe('secondary');
  });

  // ----- inline latest record -----

  it('requests this record and shows the most recent change inline', () => {
    build('Course', 123);

    // The newest row is carol's Delete; the label and inline summary are both present.
    expect(text()).toContain('異動紀錄 History');
    expect(text()).toContain('Delete');
    expect(text()).toContain('carol');
    // Rendered with the +'Z' UTC trick, in whatever timezone the runner uses.
    expect(text()).toContain(renderedTime(trail[0].dateTime, 'yyyy/MM/dd HH:mm'));
  });

  it('shows the neutral no-history state when the record has never changed', () => {
    build('Course', 123, []);

    expect(text()).toContain('尚無異動紀錄 No history');
    expect(text()).not.toContain('by ');
  });

  it('does not query and shows no-history for an unsaved record (pkid 0)', () => {
    // rows=null: assert NO request is made at all.
    build('Course', 0, null);
    httpMock.expectNone((r) => r.url === base);

    expect(text()).toContain('尚無異動紀錄 No history');
  });

  // ----- dialog with the full trail -----

  it('opens the dialog with the full trail, newest first, on click', () => {
    build('Course', 123);

    const badge = fixture.nativeElement.querySelector('[data-testid="audit-badge"]') as HTMLButtonElement;
    badge.click();
    fixture.detectChanges();

    // p-dialog renders to an overlay in the document body, not inside the host element.
    const dialog = document.querySelector('.p-dialog') as HTMLElement;
    expect(dialog).withContext('dialog should be open').not.toBeNull();

    const bodyRows = dialog.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(3);
    // Row order preserved: Delete (newest) → Update → Insert (oldest).
    expect(bodyRows[0].textContent).toContain('Delete');
    expect(bodyRows[1].textContent).toContain('Update');
    expect(bodyRows[1].textContent).toContain('Title, DisplayOrder');
    expect(bodyRows[2].textContent).toContain('Insert');

    // Clean up the overlay so it doesn't leak into the next test.
    dialog.remove();
  });

  it('shows the friendly empty state in the dialog when there is no history', () => {
    build('Course', 123, []);

    const badge = fixture.nativeElement.querySelector('[data-testid="audit-badge"]') as HTMLButtonElement;
    badge.click();
    fixture.detectChanges();

    const dialog = document.querySelector('.p-dialog') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('No history yet');
    expect(dialog.querySelectorAll('tbody tr').length).toBe(0);

    dialog.remove();
  });

  // ----- compact (lazy) mode -----

  it('compact mode renders only the icon button and fetches nothing on load', () => {
    fixture = TestBed.createComponent(RowAuditBadge);
    fixture.componentRef.setInput('tableName', 'Course');
    fixture.componentRef.setInput('pkid', 123);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    // The whole point: a list of N rows must not fire N GETs.
    httpMock.expectNone((r) => r.url === base);
    // Icon button, no inline summary.
    expect(fixture.nativeElement.querySelector('.pi-history')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-badge"]')).toBeNull();
    expect(text()).not.toContain('尚無異動紀錄');
  });

  it('compact mode fetches on click and opens the dialog with the trail', () => {
    fixture = TestBed.createComponent(RowAuditBadge);
    fixture.componentRef.setInput('tableName', 'Course');
    fixture.componentRef.setInput('pkid', 123);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('p-button button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === base);
    expect(req.request.params.get('tableName')).toBe('Course');
    expect(req.request.params.get('pkid')).toBe('123');
    req.flush(trail);
    fixture.detectChanges();

    const dialog = document.querySelector('.p-dialog') as HTMLElement;
    expect(dialog).withContext('dialog should be open').not.toBeNull();
    expect(dialog.querySelectorAll('tbody tr').length).toBe(3);
    expect(dialog.textContent).toContain('carol');

    dialog.remove();
  });

  it('compact mode refetches on every open, so an inline edit between opens is not stale', () => {
    fixture = TestBed.createComponent(RowAuditBadge);
    fixture.componentRef.setInput('tableName', 'Course');
    fixture.componentRef.setInput('pkid', 123);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('p-button button') as HTMLButtonElement;
    button.click();
    httpMock.expectOne((r) => r.url === base).flush(trail);
    fixture.detectChanges();

    button.click();
    httpMock.expectOne((r) => r.url === base).flush(trail);
    fixture.detectChanges();

    document.querySelector('.p-dialog')?.remove();
  });

  // ----- failure -----

  it('shows an unavailable state when the request errors', () => {
    fixture = TestBed.createComponent(RowAuditBadge);
    fixture.componentRef.setInput('tableName', 'Course');
    fixture.componentRef.setInput('pkid', 123);
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === base).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('無法載入 Unavailable');
  });
});
