using CMS.API.Data;
using CMS.API.Repositories;
using Dapper;

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
});

// Data access
builder.Services.AddSingleton<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<IAppRoleRepository, AppRoleRepository>();
builder.Services.AddScoped<ICourseGroupRepository, CourseGroupRepository>();
builder.Services.AddScoped<ILookupRepository, LookupRepository>();

// CORS — allow the Angular dev server (and any localhost origin) during development.
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.SetIsOriginAllowed(origin => new Uri(origin).IsLoopback)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();

// --- Pipeline ---
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "CMS.API v1");
    options.RoutePrefix = "swagger";
});

app.UseCors(CorsPolicy);
app.UseAuthorization();
app.MapControllers();

app.Run();

// Exposed for WebApplicationFactory-based integration testing.
public partial class Program { }
