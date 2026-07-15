/**
 * Builds a JWT-shaped string for tests.
 *
 * The signature is a placeholder: the frontend only ever *decodes* the payload to read
 * claims — verifying the signature is the API's job, and faking one here would prove
 * nothing. The encoding (base64url, UTF-8, no padding) matches what the API emits, which
 * is the part the client actually depends on.
 */
function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param role Omit for a token with no role claim. The API emits a bare string for a
 *   single role and an array for several, so both shapes are worth passing.
 */
export function tokenWithRoles(
  role?: string | string[],
  extraClaims: Record<string, unknown> = {},
): string {
  const payload: Record<string, unknown> = {
    sub: 'miles@uuu.com.tw',
    name: 'Miles',
    ...(role === undefined ? {} : { role }),
    ...extraClaims,
  };

  return [
    base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64Url(JSON.stringify(payload)),
    'test-signature-not-verified-client-side',
  ].join('.');
}
