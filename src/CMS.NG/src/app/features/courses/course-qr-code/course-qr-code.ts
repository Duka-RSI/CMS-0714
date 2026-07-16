import { Component, computed, effect, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import QRCode, { QRCodeToDataURLOptions } from 'qrcode';

/** Public course page the QR code points at. */
export const COURSE_QR_BASE_URL = 'https://www.uuu.com.tw/Course/Show';

/**
 * Options used to render the QR. Exported so specs can regenerate the expected image
 * with the exact same settings and compare it byte-for-byte against what we rendered.
 */
export const QR_RENDER_OPTIONS: QRCodeToDataURLOptions = {
  width: 220,
  margin: 1,
  errorCorrectionLevel: 'M',
};

/** Layout of the composited download image (title band above the QR), in px. */
const COMPOSITE = {
  padding: 16,
  titleHeight: 34,
  titleBaseline: 24,
  font: '600 16px system-ui, sans-serif',
} as const;

/**
 * Build the public course URL a QR encodes.
 *
 * CourseId goes through encodeURIComponent: it is free text in the DB, so a value with a
 * space or slash would otherwise produce a broken URL. Ordinary ids like `AZ-104` are
 * unaffected.
 */
export function buildCourseQrUrl(pkid: number, courseId: string): string {
  return `${COURSE_QR_BASE_URL}/${pkid}/${encodeURIComponent(courseId)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('QR image failed to load'));
    image.src = src;
  });
}

/**
 * Inline QR code for a course, shown in the detail page's 課程資料 card. Encodes the
 * public course URL and offers the image as a download with the CourseId composited in
 * as a title (per spec/sample1.spec.md's "canvas compositing").
 */
@Component({
  selector: 'app-course-qr-code',
  imports: [CommonModule, ButtonModule],
  templateUrl: './course-qr-code.html',
  styleUrl: './course-qr-code.scss',
})
export class CourseQrCode {
  readonly pkid = input.required<number>();
  readonly courseId = input.required<string>();

  /** The URL encoded into the QR. */
  readonly targetUrl = computed(() => buildCourseQrUrl(this.pkid(), this.courseId()));

  protected readonly qrDataUrl = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    // Re-renders whenever pkid/courseId change.
    effect(() => {
      const url = this.targetUrl();
      QRCode.toDataURL(url, QR_RENDER_OPTIONS)
        .then((dataUrl) => {
          this.qrDataUrl.set(dataUrl);
          this.failed.set(false);
        })
        .catch(() => {
          this.qrDataUrl.set(null);
          this.failed.set(true);
        });
    });
  }

  /**
   * Draw the QR with its CourseId title onto one canvas and return it as a PNG data URL.
   * Returns null when the QR has not rendered yet.
   */
  async composeImage(): Promise<string | null> {
    const qr = this.qrDataUrl();
    if (!qr) {
      return null;
    }

    const image = await loadImage(qr);
    const { padding, titleHeight, titleBaseline, font } = COMPOSITE;

    const canvas = document.createElement('canvas');
    canvas.width = image.width + padding * 2;
    canvas.height = image.height + titleHeight + padding * 2;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    // Opaque background — a transparent PNG turns the QR unreadable on dark viewers.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.fillText(this.courseId(), canvas.width / 2, padding + titleBaseline);

    ctx.drawImage(image, padding, padding + titleHeight);

    return canvas.toDataURL('image/png');
  }

  /** Download the composited image as {CourseId}.png. */
  async download(): Promise<void> {
    const dataUrl = await this.composeImage();
    if (!dataUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${this.courseId()}.png`;
    link.click();
  }
}
