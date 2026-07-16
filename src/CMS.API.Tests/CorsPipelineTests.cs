using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Xunit;

namespace CMS.API.Tests;

/// <summary>
/// The CORS policy, driven over real HTTP by a browser-shaped request.
/// </summary>
/// <remarks>
/// The front end is served from :4200 and the API from :5000 with no proxy, so every call the
/// app makes is cross-origin. That makes the policy part of the contract rather than
/// deployment trivia: a response header the browser hides from script may as well not have
/// been sent. Controller unit tests assert what the action returns and never run the CORS
/// middleware, so they cannot see any of this — <see cref="CoursesControllerPdfTests"/> was
/// green for the entire time the export's filename rules were unreachable in a browser.
/// </remarks>
public class CorsPipelineTests : IClassFixture<CorsPipelineTests.Factory>
{
    private const string SigningKey = "cloud4fun#123456cloud4fun#123456";
    private const string Password = "CMS4fun#";

    /// <summary>Where the Angular dev server serves from — see the CORS policy in Program.cs.</summary>
    private const string BrowserOrigin = "http://localhost:4200";

    private readonly Factory _factory;

    public CorsPipelineTests(Factory factory) => _factory = factory;

    public class Factory : WebApplicationFactory<Program>
    {
        public Mock<IAuthRepository> AuthRepository { get; } = new();
        public Mock<ICourseRepository> CourseRepository { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<ISigningKeyProvider>();
                var signingKeys = new Mock<ISigningKeyProvider>();
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey));
                signingKeys.Setup(k => k.GetAsync(It.IsAny<CancellationToken>())).ReturnsAsync(key);
                signingKeys.Setup(k => k.Get()).Returns(key);
                services.AddSingleton(signingKeys.Object);

                services.RemoveAll<IAuthRepository>();
                services.AddScoped(_ => AuthRepository.Object);
                services.RemoveAll<ICourseRepository>();
                services.AddScoped(_ => CourseRepository.Object);

                // Program.cs registers TimeProvider.System; a fixed clock keeps the stamped
                // filename identical in any runner's timezone.
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(new FixedTimeProvider());
            });
        }
    }

    /// <summary>Mirrors the clock in <see cref="CoursesControllerPdfTests"/>: 2026-07-16 14:30 UTC.</summary>
    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 7, 16, 14, 30, 0, TimeSpan.Zero);
        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;
    }

    private async Task<string> LoginAsync()
    {
        _factory.AuthRepository
            .Setup(r => r.GetCredentialAsync("miles@uuu.com.tw", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AppUserCredential
            {
                UserId = "miles@uuu.com.tw",
                UserName = "Miles",
                IsActive = true,
                PasswordHash = PasswordHasher.Hash(Password),
                RoleIds = ["User"],
            });

        var response = await _factory.CreateClient()
            .PostAsJsonAsync("/api/Auth/login", new { userId = "miles@uuu.com.tw", password = Password });
        response.EnsureSuccessStatusCode();

        return (await response.Content.ReadFromJsonAsync<LoginResponse>())!.AccessToken;
    }

    /// <summary>Exports one course exactly as the browser does: cross-origin, with an Origin header.</summary>
    private async Task<HttpResponseMessage> ExportOneCourseAsync()
    {
        _factory.CourseRepository
            .Setup(r => r.GetForExportAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new CourseExport
            {
                Course = new Course
                {
                    Pkid = 1,
                    Title = "雲端課程",
                    CourseId = "AZ-305",
                    ProdCourseId = "P-1",
                    FriendlyUrl = "u",
                    ScheduleOn = new DateOnly(2026, 1, 1),
                    ScheduleOff = new DateOnly(2026, 12, 31),
                    PartnerName = "微軟",
                    PublishStatusDescription = "已上架",
                },
            }]);

        var token = await LoginAsync();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/courses/pdf")
        {
            Content = JsonContent.Create(new { pkids = new[] { 1 } }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("Origin", BrowserOrigin);

        return await _factory.CreateClient().SendAsync(request);
    }

    [Fact]
    public async Task ExportPdf_FromTheBrowsersOrigin_IsAllowedAtAll()
    {
        var response = await ExportOneCourseAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Proves the policy matched this origin. Without this, the expose-header test below
        // would fail for the wrong reason — "CORS is off" rather than "the header is hidden".
        Assert.Equal(BrowserOrigin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task ExportPdf_FromTheBrowsersOrigin_ExposesContentDispositionToScript()
    {
        var response = await ExportOneCourseAsync();

        // The regression this file exists for. AllowAnyHeader() governs the REQUEST headers a
        // browser may send and says nothing about which RESPONSE headers script may read, so
        // dropping WithExposedHeaders("Content-Disposition") from the policy hides the filename
        // and nothing, anywhere, errors: the download still succeeds under a generic name.
        Assert.True(response.Headers.TryGetValues("Access-Control-Expose-Headers", out var exposed),
            "No Access-Control-Expose-Headers: script cannot read the download's filename.");
        Assert.Contains("Content-Disposition", string.Join(",", exposed!), StringComparison.OrdinalIgnoreCase);
    }

    /// <remarks>
    /// The other half of the chain, and only the other half: <see cref="HttpClient"/> is not a
    /// browser and enforces no CORS at all, so this passes whether or not the header is exposed.
    /// It proves the header physically carries the stamped name through the real pipeline — the
    /// controller unit test asserts <c>FileDownloadName</c> on the result object, one layer
    /// earlier. Readability is guarded by
    /// <see cref="ExportPdf_FromTheBrowsersOrigin_ExposesContentDispositionToScript"/>; both
    /// must hold for the front end to see this name.
    /// </remarks>
    [Fact]
    public async Task ExportPdf_TheContentDispositionHeader_CarriesTheStampedFilename()
    {
        var response = await ExportOneCourseAsync();

        var header = response.Content.Headers.ContentDisposition;
        Assert.NotNull(header);
        Assert.Equal("AZ-305-20260716-1430.pdf", header!.FileNameStar ?? header.FileName?.Trim('"'));
    }
}
