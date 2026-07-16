import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';

import { filenameFromResponse, readErrorMessage } from './download.util';

describe('download.util', () => {
  describe('filenameFromResponse', () => {
    function responseWith(contentDisposition: string | null): HttpResponse<Blob> {
      const headers = contentDisposition
        ? new HttpHeaders({ 'Content-Disposition': contentDisposition })
        : new HttpHeaders();
      return new HttpResponse<Blob>({ headers });
    }

    it('takes the name the server chose', () => {
      const response = responseWith('attachment; filename=AZ-305-20260716-1430.pdf');

      expect(filenameFromResponse(response, 'fallback.pdf')).toBe('AZ-305-20260716-1430.pdf');
    });

    it('unquotes a quoted name', () => {
      const response = responseWith('attachment; filename="courses-2-20260716-1430.pdf"');

      expect(filenameFromResponse(response, 'fallback.pdf')).toBe('courses-2-20260716-1430.pdf');
    });

    it('prefers the RFC 5987 form, which is what carries a non-ASCII name', () => {
      // ASP.NET emits both: the plain one is mangled, the extended one is right.
      const response = responseWith(
        `attachment; filename=____.pdf; filename*=UTF-8''%E8%AA%B2%E7%A8%8B.pdf`,
      );

      expect(filenameFromResponse(response, 'fallback.pdf')).toBe('課程.pdf');
    });

    it('falls back when the header is absent', () => {
      // Normal on a cross-origin response: the header is only readable when the API opts in
      // with Access-Control-Expose-Headers.
      expect(filenameFromResponse(responseWith(null), 'fallback.pdf')).toBe('fallback.pdf');
    });

    it('falls back when the header carries no filename', () => {
      expect(filenameFromResponse(responseWith('attachment'), 'fallback.pdf')).toBe('fallback.pdf');
    });

    it('falls back to the plain form when the extended one is malformed', () => {
      const response = responseWith(`attachment; filename=ok.pdf; filename*=UTF-8''%E4%B8%`);

      // A broken percent-escape must not throw out of a download.
      expect(filenameFromResponse(response, 'fallback.pdf')).toBe('ok.pdf');
    });
  });

  describe('readErrorMessage', () => {
    it('reads the { message } the API put in a blob error body', async () => {
      // The whole reason this helper exists: responseType 'blob' applies to errors too, so
      // Angular never parses this and error.error.message is silently undefined.
      const error = new HttpErrorResponse({
        status: 400,
        error: new Blob([JSON.stringify({ message: '找不到選取的課程，可能已被刪除。' })]),
      });

      expect(await readErrorMessage(error)).toBe('找不到選取的課程，可能已被刪除。');
    });

    it('reads ProblemDetails title, which is where ValidationProblem(string) puts it', async () => {
      const error = new HttpErrorResponse({
        status: 400,
        error: new Blob([JSON.stringify({ title: '請至少選擇一門課程。', status: 400 })]),
      });

      expect(await readErrorMessage(error)).toBe('請至少選擇一門課程。');
    });

    it('returns null for a non-JSON body', async () => {
      // A proxy's HTML error page has no message to show.
      const error = new HttpErrorResponse({ status: 502, error: new Blob(['<html>oops</html>']) });

      expect(await readErrorMessage(error)).toBeNull();
    });

    it('returns null for an empty body', async () => {
      const error = new HttpErrorResponse({ status: 500, error: new Blob([]) });

      expect(await readErrorMessage(error)).toBeNull();
    });

    it('reads an already-parsed body without a round-trip', async () => {
      const error = new HttpErrorResponse({ status: 400, error: { message: '直接就是物件' } });

      expect(await readErrorMessage(error)).toBe('直接就是物件');
    });

    it('returns null when there is no body at all', async () => {
      expect(await readErrorMessage(new HttpErrorResponse({ status: 0 }))).toBeNull();
    });
  });

});
