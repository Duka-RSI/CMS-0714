using System.Data;
using Dapper;

namespace CMS.API.Data;

/// <summary>
/// Maps SQL Server <c>date</c> columns to <see cref="DateOnly"/>.
/// Registered globally in Program.cs so every feature can use <see cref="DateOnly"/> directly.
/// </summary>
public sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }

    public override DateOnly Parse(object value) => value switch
    {
        DateTime dt => DateOnly.FromDateTime(dt),
        DateOnly d => d,
        _ => DateOnly.Parse((string)value)
    };
}

/// <summary>
/// Maps SQL Server <c>time</c> columns to <see cref="TimeOnly"/>.
/// </summary>
public sealed class TimeOnlyTypeHandler : SqlMapper.TypeHandler<TimeOnly>
{
    public override void SetValue(IDbDataParameter parameter, TimeOnly value)
    {
        parameter.DbType = DbType.Time;
        parameter.Value = value.ToTimeSpan();
    }

    public override TimeOnly Parse(object value) => value switch
    {
        TimeSpan ts => TimeOnly.FromTimeSpan(ts),
        DateTime dt => TimeOnly.FromDateTime(dt),
        TimeOnly t => t,
        _ => TimeOnly.Parse((string)value)
    };
}
