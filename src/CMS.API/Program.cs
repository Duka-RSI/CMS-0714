using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Middleware;
using CMS.API.Pdf;
using QuestPDF.Infrastructure;
using CMS.API.Repositories;
using CMS.API.Security;
using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "LocalhostCors";

// --- Dapper global configuration ---
// DateOnly/TimeOnly handlers registered once so every feature can use them.
SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
SqlMapper.AddTypeHandler(new TimeOnlyTypeHandler());

// --- Services ---
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "CMS.API", Version = "v1" });

    // Lets Swagger UI's "Authorize" button attach a login token to protected endpoints.
    options.AddSecurityDefinition(JwtBearerDefaults.AuthenticationScheme, new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "貼上 POST /api/Auth/login 回傳的 accessToken(不需自行加 'Bearer ' 前綴)。",
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference
            {
                Type = ReferenceType.SecurityScheme,
                Id = JwtBearerDefaults.AuthenticationScheme,
            },
        }] = []
    });
});

// Data access
builder.Services.AddSingleton<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<IAppRoleRepository, AppRoleRepository>();
builder.Services.AddScoped<ISysConfigRepository, SysConfigRepository>();
builder.Services.AddScoped<IAppUserRepository, AppUserRepository>();
builder.Services.AddScoped<IPublishStatusRepository, PublishStatusRepository>();
builder.Services.AddScoped<IPartnerRepository, PartnerRepository>();
builder.Services.AddScoped<ICourseGroupRepository, CourseGroupRepository>();
builder.Services.AddScoped<ICourseRepository, CourseRepository>();
builder.Services.AddScoped<IFeaturedPromoItemRepository, FeaturedPromoItemRepository>();
builder.Services.AddScoped<ILookupRepository, LookupRepository>();
builder.Services.AddScoped<IAuthRepository, AuthRepository>();
builder.Services.AddScoped<IRowAuditRepository, RowAuditRepository>();

// Row auditing — RowAuditWriter reads the caller off the current request's token, so it
// needs the HttpContext accessor. No repository calls it yet.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IRowAuditWriter, RowAuditWriter>();

// Login / token issuing
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<ISigningKeyProvider, SigningKeyProvider>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

// --- Authentication: bearer tokens signed with the SysConfig 'appConfig' secret ---
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<ISigningKeyProvider>((options, signingKeys) =>
    {
        // Keep "sub"/"name"/"role" verbatim instead of remapping them to ClaimTypes.* URIs.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            // This API is the only issuer and the only consumer, so there is no iss/aud to check.
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            NameClaimType = JwtTokenService.UserNameClaimType,
            RoleClaimType = JwtTokenService.RoleClaimType,
            // Resolved per validation (off a cached key) so rotating the SysConfig row
            // takes effect without a restart.
            IssuerSigningKeyResolver = (_, _, _, _) => [signingKeys.Get()],
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });

// --- Authorization: every endpoint requires a login unless it opts out ---
// FallbackPolicy applies only to endpoints carrying no authorization metadata, so
// [AllowAnonymous] on AuthController and [Authorize(Roles=...)] elsewhere both win.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// CORS — allow the Angular dev server (and any localhost origin) during development.
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.SetIsOriginAllowed(origin => new Uri(origin).IsLoopback)
              .AllowAnyHeader()
              .AllowAnyMethod()
              // AllowAnyHeader covers the REQUEST headers the browser may send; it says nothing
              // about which RESPONSE headers script may read. Without this, the front end
              // (:4200 → :5000 is cross-origin — there is no proxy) cannot see the filename the
              // PDF export chose, falls back to a generic one, and nothing anywhere errors.
              .WithExposedHeaders("Content-Disposition"));
});

var app = builder.Build();

// --- PDF export ---
// QuestPDF refuses to render at all until a license type is declared. Community is the
// free tier: valid while the company's annual gross revenue stays under 1M USD — revisit
// this line, not just the package, if that stops being true.
QuestPDF.Settings.License = LicenseType.Community;
// Checked once, at startup: a host without the font renders blank Chinese and says nothing,
// so that is worth hearing about now rather than per download.
PdfFonts.Verify(app.Services.GetRequiredService<ILogger<Program>>());

// --- Pipeline ---
// Outermost on purpose: anything the rest of the pipeline throws becomes a logged,
// generic 500 — no stack trace, SQL text, or connection string ever reaches the caller.
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "CMS.API v1");
    options.RoutePrefix = "swagger";
});

app.UseCors(CorsPolicy);
// Order matters: authentication establishes who the caller is, authorization then judges them.
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Exposed for WebApplicationFactory-based integration testing.
public partial class Program { }
