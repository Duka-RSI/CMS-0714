using CMS.API.Security;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// The complexity rule: at least 8 characters, drawing on at least 3 of the 4 classes
/// (uppercase / lowercase / digit / symbol).
/// </summary>
public class PasswordPolicyTests
{
    // ----- Length -----

    [Theory]
    [InlineData("Aa1!")]        // 4 classes but only 4 long
    [InlineData("Aa1!Aa1")]     // 4 classes, 7 long — one short
    public void IsCompliant_RejectsAnythingShorterThanEight(string password)
    {
        Assert.False(PasswordPolicy.IsCompliant(password));
    }

    [Fact]
    public void IsCompliant_AcceptsExactlyEightWithThreeClasses()
    {
        // The boundary: 8 characters, upper + lower + digit.
        Assert.True(PasswordPolicy.IsCompliant("Abcdefg1"));
        Assert.Equal(8, PasswordPolicy.MinimumLength);
    }

    // ----- Character classes -----

    [Theory]
    [InlineData("Abcdefg1", "upper + lower + digit")]
    [InlineData("Abcdefg!", "upper + lower + symbol")]
    [InlineData("ABCDEFG1!", "upper + digit + symbol")]
    [InlineData("abcdefg1!", "lower + digit + symbol")]
    [InlineData("Abcdefg1!", "all four")]
    [InlineData("CMS4fun#", "the SysConfig default: upper + lower + digit + symbol")]
    public void IsCompliant_AcceptsThreeOrMoreClasses(string password, string why)
    {
        Assert.True(PasswordPolicy.IsCompliant(password), why);
    }

    [Theory]
    [InlineData("abcdefghij", "lower only")]
    [InlineData("ABCDEFGHIJ", "upper only")]
    [InlineData("1234567890", "digit only")]
    [InlineData("!@#$%^&*()", "symbol only")]
    [InlineData("abcdefgH", "lower + upper only")]
    [InlineData("abcdefg1", "lower + digit only")]
    [InlineData("abcdefg!", "lower + symbol only")]
    [InlineData("ABCDEFG1", "upper + digit only")]
    [InlineData("12345678!", "digit + symbol only")]
    public void IsCompliant_RejectsFewerThanThreeClasses(string password, string why)
    {
        // Long enough, but too narrow.
        Assert.True(password.Length >= PasswordPolicy.MinimumLength, "fixture should be long enough");
        Assert.False(PasswordPolicy.IsCompliant(password), why);
    }

    [Fact]
    public void IsCompliant_RequiresExactlyThreeOfFour()
    {
        Assert.Equal(3, PasswordPolicy.RequiredCharacterClasses);
    }

    // ----- What counts as what -----

    [Theory]
    [InlineData("Abcdefg ")]    // space
    [InlineData("Abcdefg_")]    // underscore
    [InlineData("Abcdefg€")]    // currency
    [InlineData("Abcdefg。")]   // CJK punctuation
    public void IsCompliant_CountsAnyNonAlphanumericAsASymbol(string password)
    {
        // upper + lower + symbol = 3 classes.
        Assert.True(PasswordPolicy.IsCompliant(password));
    }

    [Fact]
    public void IsCompliant_GivesCaselessLettersNoClassAtAll()
    {
        // CJK characters are letters but have no case, so they satisfy nothing. Long, and
        // still rejected.
        Assert.False(PasswordPolicy.IsCompliant("密碼密碼密碼密碼密碼"));
        // ...and they do not top up a password that is otherwise one class short.
        Assert.False(PasswordPolicy.IsCompliant("abcdefg密碼"));
        // ...but they do not break one that is already compliant.
        Assert.True(PasswordPolicy.IsCompliant("Abcdefg1密碼"));
    }

    [Fact]
    public void IsCompliant_DoesNotTrim()
    {
        // Spaces are part of the secret, and count towards both length and the symbol class.
        Assert.True(PasswordPolicy.IsCompliant("  Abcdef  "));
    }

    // ----- Degenerate input -----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("        ")]    // 8 spaces: long enough, but one class
    public void IsCompliant_RejectsEmptyOrDegenerateInput(string? password)
    {
        Assert.False(PasswordPolicy.IsCompliant(password));
    }

    // ----- The message -----

    [Fact]
    public void RequirementMessage_IsBilingualAndStatesTheRule()
    {
        var message = PasswordPolicy.RequirementMessage;

        // Shown verbatim in the UI; the Angular copy must stay identical.
        Assert.Contains("密碼長度至少需 8 碼", message);
        Assert.Contains("大寫英文／小寫英文／數字／符號", message);
        Assert.Contains("at least 3 of the 4 classes", message);
    }
}
