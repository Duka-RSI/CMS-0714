import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRED_CLASSES,
  PASSWORD_REQUIREMENT_MESSAGE,
  isPasswordCompliant,
} from './password-policy';

/**
 * Mirrors PasswordPolicyTests on the API. If these two suites ever disagree, the form will
 * accept passwords the server rejects (or vice versa) — so the cases are kept in step.
 */
describe('password-policy', () => {
  describe('length', () => {
    it('rejects anything shorter than 8, however many classes it uses', () => {
      expect(isPasswordCompliant('Aa1!')).toBeFalse();
      expect(isPasswordCompliant('Aa1!Aa1')).toBeFalse();
    });

    it('accepts exactly 8 with three classes', () => {
      expect(isPasswordCompliant('Abcdefg1')).toBeTrue();
      expect(PASSWORD_MIN_LENGTH).toBe(8);
    });
  });

  describe('character classes', () => {
    it('accepts three or more of the four', () => {
      expect(isPasswordCompliant('Abcdefg1')).toBeTrue(); // upper + lower + digit
      expect(isPasswordCompliant('Abcdefg!')).toBeTrue(); // upper + lower + symbol
      expect(isPasswordCompliant('ABCDEFG1!')).toBeTrue(); // upper + digit + symbol
      expect(isPasswordCompliant('abcdefg1!')).toBeTrue(); // lower + digit + symbol
      expect(isPasswordCompliant('Abcdefg1!')).toBeTrue(); // all four
      expect(isPasswordCompliant('CMS4fun#')).toBeTrue(); // the SysConfig default
    });

    it('rejects fewer than three, however long', () => {
      expect(isPasswordCompliant('abcdefghij')).toBeFalse(); // lower only
      expect(isPasswordCompliant('ABCDEFGHIJ')).toBeFalse(); // upper only
      expect(isPasswordCompliant('1234567890')).toBeFalse(); // digit only
      expect(isPasswordCompliant('!@#$%^&*()')).toBeFalse(); // symbol only
      expect(isPasswordCompliant('abcdefgH')).toBeFalse(); // lower + upper
      expect(isPasswordCompliant('abcdefg1')).toBeFalse(); // lower + digit
      expect(isPasswordCompliant('12345678!')).toBeFalse(); // digit + symbol
    });

    it('requires 3 of 4', () => {
      expect(PASSWORD_REQUIRED_CLASSES).toBe(3);
    });
  });

  describe('what counts as what', () => {
    it('treats any non-letter, non-digit as a symbol', () => {
      expect(isPasswordCompliant('Abcdefg ')).toBeTrue(); // space
      expect(isPasswordCompliant('Abcdefg_')).toBeTrue(); // underscore
      expect(isPasswordCompliant('Abcdefg€')).toBeTrue(); // currency
      expect(isPasswordCompliant('Abcdefg。')).toBeTrue(); // CJK punctuation
    });

    it('counts numeric characters outside Nd as symbols, matching .NET', () => {
      // '½' is Unicode No. char.IsDigit is false for it, so .NET calls it a symbol —
      // a \p{N} symbol class here would disagree and diverge from the server.
      expect(isPasswordCompliant('Abcdefg½')).toBeTrue();
    });

    it('gives caseless letters no class at all', () => {
      expect(isPasswordCompliant('密碼密碼密碼密碼密碼')).toBeFalse();
      expect(isPasswordCompliant('abcdefg密碼')).toBeFalse();
      expect(isPasswordCompliant('Abcdefg1密碼')).toBeTrue();
    });

    it('does not trim', () => {
      expect(isPasswordCompliant('  Abcdef  ')).toBeTrue();
    });
  });

  describe('degenerate input', () => {
    it('rejects empty, null and undefined', () => {
      expect(isPasswordCompliant('')).toBeFalse();
      expect(isPasswordCompliant(null)).toBeFalse();
      expect(isPasswordCompliant(undefined)).toBeFalse();
    });

    it('rejects eight spaces (long enough, one class)', () => {
      expect(isPasswordCompliant('        ')).toBeFalse();
    });
  });

  it('states the rule bilingually, identically to the API', () => {
    // Must stay byte-for-byte identical to PasswordPolicy.RequirementMessage.
    expect(PASSWORD_REQUIREMENT_MESSAGE).toBe(
      '密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：' +
        '大寫英文／小寫英文／數字／符號 ' +
        '(Password must be at least 8 characters and contain at least 3 of the 4 classes: ' +
        'uppercase / lowercase / digit / symbol.)',
    );
  });
});
