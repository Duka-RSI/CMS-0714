import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import QRCode from 'qrcode';

import {
  CourseQrCode,
  COURSE_QR_BASE_URL,
  QR_RENDER_OPTIONS,
  buildCourseQrUrl,
} from './course-qr-code';

/** Decode a data URL back into an image so tests can assert on real pixels. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not load image'));
    image.src = src;
  });
}

/**
 * Capture every anchor the component creates and stub its click, so the download can be
 * asserted without the browser actually navigating.
 */
function captureAnchors(): HTMLAnchorElement[] {
  const anchors: HTMLAnchorElement[] = [];
  const create = document.createElement.bind(document);
  spyOn(document, 'createElement').and.callFake((tag: string) => {
    const el = create(tag);
    if (tag === 'a') {
      spyOn(el as HTMLAnchorElement, 'click');
      anchors.push(el as HTMLAnchorElement);
    }
    return el;
  });
  return anchors;
}

describe('CourseQrCode', () => {
  let fixture: ComponentFixture<CourseQrCode>;
  let component: CourseQrCode;

  /** Render the component and wait for the async QR generation to land. */
  async function build(pkid = 1, courseId = 'AZ-104') {
    fixture = TestBed.createComponent(CourseQrCode);
    fixture.componentRef.setInput('pkid', pkid);
    fixture.componentRef.setInput('courseId', courseId);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs the effect that kicks off QR generation
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseQrCode],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  // ----- URL construction -----

  describe('the encoded URL', () => {
    it('is built from the record pkid and CourseId', () => {
      expect(buildCourseQrUrl(42, 'AZ-104')).toBe('https://www.uuu.com.tw/Course/Show/42/AZ-104');
    });

    it('uses the public course base URL', () => {
      expect(COURSE_QR_BASE_URL).toBe('https://www.uuu.com.tw/Course/Show');
    });

    it('percent-encodes a CourseId that would otherwise break the URL', () => {
      expect(buildCourseQrUrl(7, 'AZ 104/B')).toBe(
        'https://www.uuu.com.tw/Course/Show/7/AZ%20104%2FB',
      );
    });

    it('exposes the target URL for the rendered record', async () => {
      await build(42, 'AZ-104');
      expect(component.targetUrl()).toBe('https://www.uuu.com.tw/Course/Show/42/AZ-104');
    });
  });

  // ----- What the QR actually encodes -----

  describe('the rendered QR', () => {
    it('encodes exactly the expected URL', async () => {
      await build(42, 'AZ-104');

      // QR generation is deterministic, so regenerating the expected URL with the same
      // options must reproduce the component's image byte-for-byte. If the component had
      // encoded any other string, these would differ.
      const expected = await QRCode.toDataURL(
        'https://www.uuu.com.tw/Course/Show/42/AZ-104',
        QR_RENDER_OPTIONS,
      );
      const img = fixture.nativeElement.querySelector('.qr-image') as HTMLImageElement;

      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe(expected);
    });

    it('does not encode a URL built from a different record', async () => {
      await build(42, 'AZ-104');

      const otherRecord = await QRCode.toDataURL(
        'https://www.uuu.com.tw/Course/Show/43/AZ-104',
        QR_RENDER_OPTIONS,
      );
      const img = fixture.nativeElement.querySelector('.qr-image') as HTMLImageElement;

      expect(img.getAttribute('src')).not.toBe(otherRecord);
    });

    it('re-encodes when the record changes', async () => {
      await build(1, 'AZ-104');
      const first = (fixture.nativeElement.querySelector('.qr-image') as HTMLImageElement).src;

      fixture.componentRef.setInput('pkid', 2);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const second = (fixture.nativeElement.querySelector('.qr-image') as HTMLImageElement).src;
      expect(second).not.toBe(first);
      expect(component.targetUrl()).toBe('https://www.uuu.com.tw/Course/Show/2/AZ-104');
    });

    it('renders a real, non-empty image', async () => {
      await build();
      const img = fixture.nativeElement.querySelector('.qr-image') as HTMLImageElement;
      const decoded = await loadImage(img.src);

      expect(decoded.width).toBe(QR_RENDER_OPTIONS.width!);
      expect(decoded.height).toBe(QR_RENDER_OPTIONS.width!);
    });
  });

  // ----- Title -----

  describe('the title', () => {
    it('shows the CourseId', async () => {
      await build(1, 'AZ-104');
      const title = fixture.nativeElement.querySelector('.qr-title') as HTMLElement;
      expect(title.textContent!.trim()).toBe('AZ-104');
    });

    it('tracks a CourseId change', async () => {
      await build(1, 'AZ-104');
      fixture.componentRef.setInput('courseId', 'MS-900');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const title = fixture.nativeElement.querySelector('.qr-title') as HTMLElement;
      expect(title.textContent!.trim()).toBe('MS-900');
    });
  });

  // ----- Download -----

  describe('the download action', () => {
    it('produces a PNG image named after the CourseId', async () => {
      await build(1, 'AZ-104');
      const anchors = captureAnchors();

      await component.download();

      expect(anchors.length).toBe(1);
      expect(anchors[0].download).toBe('AZ-104.png');
      expect(anchors[0].href.startsWith('data:image/png')).toBeTrue();
      expect(anchors[0].click).toHaveBeenCalled();
    });

    it('composites the title above the QR, so the image is taller than the QR alone', async () => {
      await build();

      const dataUrl = await component.composeImage();
      expect(dataUrl).toBeTruthy();

      const composed = await loadImage(dataUrl!);
      const qrSize = QR_RENDER_OPTIONS.width!;

      // Padding on both sides, plus a title band on top.
      expect(composed.width).toBeGreaterThan(qrSize);
      expect(composed.height).toBeGreaterThan(composed.width);
    });

    it('composites onto an opaque white background so the QR stays scannable', async () => {
      await build();
      const composed = await loadImage((await component.composeImage())!);

      const canvas = document.createElement('canvas');
      canvas.width = composed.width;
      canvas.height = composed.height;
      canvas.getContext('2d')!.drawImage(composed, 0, 0);
      const corner = canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data;

      expect([corner[0], corner[1], corner[2], corner[3]]).toEqual([255, 255, 255, 255]);
    });

    it('draws dark title pixels into the title band', async () => {
      await build(1, 'AZ-104');
      const composed = await loadImage((await component.composeImage())!);

      const canvas = document.createElement('canvas');
      canvas.width = composed.width;
      canvas.height = composed.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(composed, 0, 0);

      // The band above the QR must contain ink — otherwise the title never rendered.
      const band = ctx.getImageData(0, 0, composed.width, 40).data;
      let dark = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (band[i] < 128 && band[i + 1] < 128 && band[i + 2] < 128) {
          dark++;
        }
      }
      expect(dark).toBeGreaterThan(0);
    });

    it('does nothing when the QR has not rendered yet', async () => {
      fixture = TestBed.createComponent(CourseQrCode);
      fixture.componentRef.setInput('pkid', 1);
      fixture.componentRef.setInput('courseId', 'AZ-104');
      component = fixture.componentInstance;
      // Deliberately not awaiting whenStable: the QR is still pending.
      const anchors = captureAnchors();

      await component.download();

      expect(anchors.length).toBe(0);
    });
  });
});
