/**
 * Client-side mirror of the API's `PasswordPolicy`.
 *
 * This is a courtesy so the form can complain without a round-trip — the API re-checks
 * every password it is sent and is the authority. Both copies must agree, or the form will
 * accept something the server then rejects.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REQUIRED_CLASSES = 3;

/** Kept byte-for-byte identical to PasswordPolicy.RequirementMessage on the API. */
export const PASSWORD_REQUIREMENT_MESSAGE =
  '密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：' +
  '大寫英文／小寫英文／數字／符號 ' +
  '(Password must be at least 8 characters and contain at least 3 of the 4 classes: ' +
  'uppercase / lowercase / digit / symbol.)';

/**
 * True when the password is long enough and draws on at least 3 of the 4 character classes.
 *
 * "Symbol" is anything that is not a letter or a digit. Letters with no case (CJK, say)
 * count towards no class, matching `char.IsUpper`/`char.IsLower` on the server. Nothing is
 * trimmed — spaces are part of the secret.
 */
export function isPasswordCompliant(password: string | null | undefined): boolean {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return false;
  }

  // Unicode property escapes rather than [A-Z]/[a-z]/[0-9], so each class means exactly
  // what its .NET counterpart means:
  //   \p{Lu} = char.IsUpper, \p{Ll} = char.IsLower, \p{Nd} = char.IsDigit,
  //   [^\p{L}\p{Nd}] = !char.IsLetterOrDigit.
  // The symbol class must exclude \p{Nd}, not \p{N}: .NET counts only Nd as a digit, so
  // characters like '½' (No) are symbols there and must be symbols here too.
  const classes = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) =>
    re.test(password),
  ).length;

  return classes >= PASSWORD_REQUIRED_CLASSES;
}
