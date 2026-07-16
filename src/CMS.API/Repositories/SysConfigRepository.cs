using System.Text.Json;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class SysConfigRepository : ISysConfigRepository
{
    private const string AppConfigKey = "appConfig";

    // The stored JSON uses camelCase keys ("defaultPassword").
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IDbConnectionFactory _connectionFactory;

    public SysConfigRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<AppConfig> GetAppConfigAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var json = await connection.ExecuteScalarAsync<string?>(new CommandDefinition(
            "SELECT configValue FROM SysConfig WHERE configKey = @ConfigKey",
            new { ConfigKey = AppConfigKey }, cancellationToken: cancellationToken));

        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidOperationException(
                $"SysConfig '{AppConfigKey}' 設定不存在或為空,無法取得預設密碼。");
        }

        AppConfig? config;
        try
        {
            config = JsonSerializer.Deserialize<AppConfig>(json, JsonOptions);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"SysConfig '{AppConfigKey}' 的內容不是有效的 JSON。", ex);
        }

        if (config is null || string.IsNullOrWhiteSpace(config.DefaultPassword))
        {
            throw new InvalidOperationException(
                $"SysConfig '{AppConfigKey}' 未設定 'defaultPassword'。");
        }

        return config;
    }
}
