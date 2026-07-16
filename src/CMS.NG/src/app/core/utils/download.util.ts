import { HttpErrorResponse, HttpResponse } from '@angular/common/http';

/**
 * Pure helpers for endpoints that answer with a file instead of JSON. The download itself
 * lives in `FileDownloadService` — it touches the DOM, so it belongs behind DI.
 *
 * The awkward part is that `responseType: 'blob'` applies to error responses too, so an API
 * that returns a tidy `{ message }` on a 400 hands it over as an unparsed Blob — see
 * {@link readErrorMessage}.
 */

/**
 * The filename the server chose, from `Content-Disposition`, or `fallback` when the header
 * is absent or unreadable.
 *
 * Prefers RFC 5987's `filename*=UTF-8''...` (which is what carries non-ASCII names) over the
 * plain `filename=`, and tolerates either being quoted.
 */
export function filenameFromResponse(response: HttpResponse<unknown>, fallback: string): string {
  const header = response.headers.get('Content-Disposition');
  if (!header) {
    // A cross-origin response only exposes this header when the API opts in with
    // Access-Control-Expose-Headers, so the fallback is a normal path, not an error.
    return fallback;
  }

  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Malformed percent-encoding — fall through to the plain form rather than throw.
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}

/**
 * The `{ message }` an API put in a failed blob request's body, or null when there is none.
 *
 * Angular does not parse the body of an errored blob request, so `error.error` is a Blob and
 * `error.error.message` is silently undefined — reading it costs an async round-trip through
 * `Blob.text()`.
 */
export async function readErrorMessage(error: HttpErrorResponse): Promise<string | null> {
  const body = error.error;

  if (!(body instanceof Blob)) {
    // Already parsed — the request was not a blob one, or the browser gave us the object.
    return typeof body?.message === 'string' ? body.message : null;
  }

  try {
    const text = await body.text();
    if (!text) {
      return null;
    }
    const parsed = JSON.parse(text);
    // ASP.NET answers with either { message } (our own errors) or ProblemDetails { title,
    // detail } — ValidationProblem("...") puts the text in `title`.
    return parsed?.message ?? parsed?.detail ?? parsed?.title ?? null;
  } catch {
    // A non-JSON body (an HTML error page from a proxy, say) has no message to show.
    return null;
  }
}
