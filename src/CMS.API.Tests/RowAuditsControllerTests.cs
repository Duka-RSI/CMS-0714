using System.Security.Claims;
using CMS.API.Controllers;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// Controller-level tests for the RowAudit read endpoint. The repository is mocked, so the
/// SQL <c>ORDER BY … DESC</c> is not exercised here — the controller's job is to pass the
/// (tableName, pkid) filter through and hand back the rows in the order it received them;
/// that the database returns them newest-first is verified against the live DB (see
/// spec/admin/RowAudit.md).
/// </summary>
public class RowAuditsControllerTests
{
    private readonly Mock<IRowAuditRepository> _repository = new(MockBehavior.Strict);
    private readonly RowAuditsController _controller;

    public RowAuditsControllerTests()
    {
        // ValidationProblem() resolves a ProblemDetailsFactory off request services; a bare
        // controller has none. Supply one, as AuthProfileControllerTests does.
        var services = new ServiceCollection();
        services.AddSingleton<ProblemDetailsFactory, TestProblemDetailsFactory>();

        _controller = new RowAuditsController(_repository.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { RequestServices = services.BuildServiceProvider() },
            },
        };
    }

    private sealed class TestProblemDetailsFactory : ProblemDetailsFactory
    {
        public override ProblemDetails CreateProblemDetails(HttpContext httpContext,
            int? statusCode = null, string? title = null, string? type = null,
            string? detail = null, string? instance = null)
            => new() { Status = statusCode ?? StatusCodes.Status500InternalServerError, Title = title, Detail = detail };

        public override ValidationProblemDetails CreateValidationProblemDetails(HttpContext httpContext,
            ModelStateDictionary modelStateDictionary, int? statusCode = null, string? title = null,
            string? type = null, string? detail = null, string? instance = null)
            => new(modelStateDictionary) { Status = statusCode ?? StatusCodes.Status400BadRequest, Title = title, Detail = detail };
    }

    private static RowAuditHistoryItem Row(string action, string user, DateTime when, string? desc = null) => new()
    {
        ActionType = action,
        UserName = user,
        DateTime = when,
        ActionDesc = desc,
    };

    /// <summary>
    /// Puts a principal with the given roles on the request, using the same role claim type
    /// the JWT pipeline is configured with, so <c>User.IsInRole</c> behaves as in production.
    /// </summary>
    private void SignInWithRoles(params string[] roleIds)
    {
        var claims = roleIds.Select(id => new Claim(JwtTokenService.RoleClaimType, id));
        var identity = new ClaimsIdentity(claims, "TestBearer",
            nameType: JwtTokenService.UserNameClaimType, roleType: JwtTokenService.RoleClaimType);
        _controller.ControllerContext.HttpContext.User = new ClaimsPrincipal(identity);
    }

    [Fact]
    public async Task GetHistory_FiltersByTableNameAndPkid()
    {
        // Strict mock: the call only matches if the exact filter is forwarded.
        _repository
            .Setup(r => r.GetHistoryAsync("Course", "123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Row("Insert", "alice", new DateTime(2026, 6, 4, 14, 30, 0)) });

        var result = await _controller.GetHistory("Course", "123", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<RowAuditHistoryItem>>(ok.Value);
        Assert.Single(payload);
        _repository.Verify(r => r.GetHistoryAsync("Course", "123", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetHistory_PreservesTheRepositoryOrder_NewestFirst()
    {
        // The repository returns them already ordered newest-first; the controller must not
        // reshuffle them.
        var newest = Row("Delete", "carol", new DateTime(2026, 6, 6, 9, 0, 0));
        var middle = Row("Update", "bob", new DateTime(2026, 6, 5, 9, 0, 0), "Title");
        var oldest = Row("Insert", "alice", new DateTime(2026, 6, 4, 9, 0, 0), "課程");
        _repository
            .Setup(r => r.GetHistoryAsync("Course", "123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { newest, middle, oldest });

        var result = await _controller.GetHistory("Course", "123", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<RowAuditHistoryItem>>(ok.Value).ToList();
        Assert.Equal(new[] { "Delete", "Update", "Insert" }, payload.Select(r => r.ActionType));
        Assert.True(payload[0].DateTime > payload[1].DateTime);
        Assert.True(payload[1].DateTime > payload[2].DateTime);
    }

    [Fact]
    public async Task GetHistory_WithNoHistory_ReturnsOkWithAnEmptyList()
    {
        _repository
            .Setup(r => r.GetHistoryAsync("Course", "999", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RowAuditHistoryItem>());

        var result = await _controller.GetHistory("Course", "999", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var payload = Assert.IsAssignableFrom<IEnumerable<RowAuditHistoryItem>>(ok.Value);
        Assert.Empty(payload);
    }

    [Theory]
    [InlineData(null, "123")]
    [InlineData("", "123")]
    [InlineData("   ", "123")]
    [InlineData("Course", null)]
    [InlineData("Course", "")]
    [InlineData("Course", "   ")]
    public async Task GetHistory_WithMissingFilter_ReturnsValidationProblem_AndNeverQueries(string? tableName, string? pkid)
    {
        // Strict mock with no Setup: a repository call would throw, proving we short-circuit.
        var result = await _controller.GetHistory(tableName!, pkid!, CancellationToken.None);

        var problem = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        Assert.IsType<ValidationProblemDetails>(problem.Value);
        _repository.Verify(
            r => r.GetHistoryAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    // ----- Each table's history carries its own table's authorization -----

    [Theory]
    [InlineData("RowAudit")]      // the audit table itself is not audited
    [InlineData("SysConfig")]     // holds the JWT signing secret; never audited, never readable
    [InlineData("Nonexistent")]
    public async Task GetHistory_ForATableThatIsNotAudited_ReturnsValidationProblem_AndNeverQueries(string tableName)
    {
        SignInWithRoles(RoleNames.Admin);

        var result = await _controller.GetHistory(tableName, "1", CancellationToken.None);

        // 400, not 401 — the caller is authenticated and merely named a table we don't audit.
        var problem = Assert.IsAssignableFrom<ObjectResult>(result.Result);
        Assert.IsType<ValidationProblemDetails>(problem.Value);
        _repository.Verify(
            r => r.GetHistoryAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Theory]
    [InlineData("AppUser")]
    [InlineData("AppRole")]
    [InlineData("PublishStatus")]
    // SQL Server's collation is case-insensitive, so a differently-cased table name would
    // match real rows: the gate has to be case-insensitive too or it is trivially bypassed.
    [InlineData("appuser")]
    public async Task GetHistory_NonAdmin_ForAnAdminOnlyTable_ReturnsForbid_AndNeverQueries(string tableName)
    {
        SignInWithRoles("User");

        var result = await _controller.GetHistory(tableName, "1", CancellationToken.None);

        // The records are Admin-only, so their history — user ids, who reset which password
        // and when — must be too.
        Assert.IsType<ForbidResult>(result.Result);
        _repository.Verify(
            r => r.GetHistoryAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task GetHistory_Admin_ForAnAdminOnlyTable_ReturnsTheHistory()
    {
        _repository
            .Setup(r => r.GetHistoryAsync("AppUser", "1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Row("Update", "admin", new DateTime(2026, 6, 4, 9, 0, 0), "PasswordUpdatedTime") });
        SignInWithRoles(RoleNames.Admin);

        var result = await _controller.GetHistory("AppUser", "1", CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Single(Assert.IsAssignableFrom<IEnumerable<RowAuditHistoryItem>>(ok.Value));
    }

    [Theory]
    [InlineData("Course")]
    [InlineData("CourseGroup")]
    [InlineData("Partner")]
    [InlineData("FeaturedPromoItem")]
    public async Task GetHistory_NonAdmin_ForAnOrdinaryTable_ReturnsTheHistory(string tableName)
    {
        _repository
            .Setup(r => r.GetHistoryAsync(tableName, "1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RowAuditHistoryItem>());
        SignInWithRoles("User");

        var result = await _controller.GetHistory(tableName, "1", CancellationToken.None);

        // These records are readable by any logged-in user, so their history is too — the
        // Admin gate must not have leaked onto the ordinary features.
        Assert.IsType<OkObjectResult>(result.Result);
    }
}
