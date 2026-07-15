using System.Data;
using CMS.API.Auditing;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public sealed class FeaturedPromoItemRepository : IFeaturedPromoItemRepository
{
    private const string AuditTableName = "FeaturedPromoItem";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IRowAuditWriter _rowAudit;

    public FeaturedPromoItemRepository(IDbConnectionFactory connectionFactory, IRowAuditWriter rowAudit)
    {
        _connectionFactory = connectionFactory;
        _rowAudit = rowAudit;
    }

    /// <summary>
    /// Slot parked here while the two rows of a swap trade places. Outside the 1–3 board
    /// range, so it can never collide with a real row on the UNIQUE index, and it only
    /// ever exists inside the swap transaction.
    /// </summary>
    private const byte ParkingSlot = 0;

    // The DB columns are TrainingCenter_pkid / Promotion_pkid; alias them to the model's
    // property names (Dapper is not configured to match names across underscores).
    private const string SelectColumns = @"
        f.pkid, f.ScheduleOn, f.TrainingCenter_pkid AS TrainingCenterPkid, f.Slot,
        f.Promotion_pkid AS PromotionPkid, f.Topic, f.Description, p.PromoCode";

    private const string FromJoin = @"
        FROM FeaturedPromoItem f
        INNER JOIN Promotion2 p ON p.pkid = f.Promotion_pkid";

    public async Task<IEnumerable<FeaturedPromoItem>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var sql = $"SELECT {SelectColumns} {FromJoin} ORDER BY f.ScheduleOn ASC, f.TrainingCenter_pkid ASC, f.Slot ASC";
        return await connection.QueryAsync<FeaturedPromoItem>(
            new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    public async Task<IEnumerable<FeaturedPromoItem>> QueryAsync(FeaturedPromoItemQuery query, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var parameters = new DynamicParameters();
        parameters.Add("WeekStart", query.WeekStart);
        // Half-open span: Monday 00:00 inclusive → next Monday exclusive = exactly 7 days.
        parameters.Add("WeekEnd", query.WeekStart.AddDays(7));
        parameters.Add("TrainingCenterPkid", query.TrainingCenterPkid);

        var sql = $@"
            SELECT {SelectColumns}
            {FromJoin}
            WHERE f.ScheduleOn >= @WeekStart
              AND f.ScheduleOn < @WeekEnd
              AND (@TrainingCenterPkid IS NULL OR f.TrainingCenter_pkid = @TrainingCenterPkid)
            ORDER BY f.ScheduleOn ASC, f.Slot ASC";

        return await connection.QueryAsync<FeaturedPromoItem>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
    }

    public async Task<FeaturedPromoItem?> GetByIdAsync(int pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        return await GetByIdAsync(connection, null, pkid, cancellationToken);
    }

    private static async Task<FeaturedPromoItem?> GetByIdAsync(
        IDbConnection connection, IDbTransaction? transaction, int pkid, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {SelectColumns} {FromJoin} WHERE f.pkid = @Pkid";
        return await connection.QuerySingleOrDefaultAsync<FeaturedPromoItem>(
            new CommandDefinition(sql, new { Pkid = pkid }, transaction, cancellationToken: cancellationToken));
    }

    public async Task<bool> SlotTakenAsync(FeaturedPromoItemRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Excluding the row itself so re-saving an unchanged row is not a conflict.
        var taken = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            @"SELECT COUNT(1) FROM FeaturedPromoItem
              WHERE ScheduleOn = @ScheduleOn
                AND TrainingCenter_pkid = @TrainingCenterPkid
                AND Slot = @Slot
                AND pkid <> @Pkid",
            request, cancellationToken: cancellationToken));

        return taken > 0;
    }

    public async Task<FeaturedPromoItem> CreateAsync(FeaturedPromoItemRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // pkid is IDENTITY — excluded from the INSERT; SCOPE_IDENTITY() returns the new key.
        var newPkid = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
            @"INSERT INTO FeaturedPromoItem
                  (ScheduleOn, TrainingCenter_pkid, Slot, Promotion_pkid, Topic, Description)
              VALUES (@ScheduleOn, @TrainingCenterPkid, @Slot, @PromotionPkid, @Topic, @Description);
              SELECT CAST(SCOPE_IDENTITY() AS int);",
            request, cancellationToken: cancellationToken));

        var created = await GetByIdAsync(connection, null, newPkid, cancellationToken);
        await _rowAudit.LogInsertAsync(AuditTableName, created!, cancellationToken);
        return created!;
    }

    public async Task<bool> UpdateAsync(FeaturedPromoItemRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Snapshot for the audit diff. A missing row means the UPDATE would have affected
        // nothing anyway, so the early return matches the previous behaviour.
        var before = await GetByIdAsync(connection, null, request.Pkid, cancellationToken);
        if (before is null)
        {
            return false;
        }

        // pkid is the immutable primary key — never updated.
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            @"UPDATE FeaturedPromoItem
              SET ScheduleOn = @ScheduleOn, TrainingCenter_pkid = @TrainingCenterPkid, Slot = @Slot,
                  Promotion_pkid = @PromotionPkid, Topic = @Topic, Description = @Description
              WHERE pkid = @Pkid",
            request, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        var after = await GetByIdAsync(connection, null, request.Pkid, cancellationToken);
        await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(int pkid, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        // Read the row before it goes: ActionDesc is its Topic.
        var deleted = await GetByIdAsync(connection, null, pkid, cancellationToken);
        if (deleted is null)
        {
            return false;
        }

        var affected = await connection.ExecuteAsync(new CommandDefinition(
            "DELETE FROM FeaturedPromoItem WHERE pkid = @Pkid",
            new { Pkid = pkid }, cancellationToken: cancellationToken));

        if (affected == 0)
        {
            return false;
        }

        await _rowAudit.LogDeleteAsync(AuditTableName, deleted, cancellationToken);
        return true;
    }

    public async Task<bool> MoveSlotAsync(SlotMoveRequest request, CancellationToken cancellationToken = default)
    {
        using var connection = await _connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();

        var moving = await GetByIdAsync(connection, transaction, request.Pkid, cancellationToken);
        if (moving is null)
        {
            transaction.Rollback();
            return false;
        }

        if (moving.Slot == request.TargetSlot)
        {
            transaction.Rollback();
            return true;
        }

        var occupantPkid = await connection.ExecuteScalarAsync<int?>(new CommandDefinition(
            @"SELECT pkid FROM FeaturedPromoItem
              WHERE ScheduleOn = @ScheduleOn
                AND TrainingCenter_pkid = @TrainingCenterPkid
                AND Slot = @TargetSlot",
            new
            {
                moving.ScheduleOn,
                moving.TrainingCenterPkid,
                request.TargetSlot
            },
            transaction, cancellationToken: cancellationToken));

        // The occupant is a second row this operation changes, so it is snapshotted and
        // audited in its own right.
        var occupantBefore = occupantPkid is null
            ? null
            : await GetByIdAsync(connection, transaction, occupantPkid.Value, cancellationToken);

        if (occupantPkid is not null)
        {
            // Three steps: the UNIQUE index over (ScheduleOn, TrainingCenter_pkid, Slot)
            // rejects a direct exchange, so park the occupant clear of the board first.
            await SetSlotAsync(connection, transaction, occupantPkid.Value, ParkingSlot, cancellationToken);
            await SetSlotAsync(connection, transaction, moving.Pkid, request.TargetSlot, cancellationToken);
            await SetSlotAsync(connection, transaction, occupantPkid.Value, moving.Slot, cancellationToken);
        }
        else
        {
            await SetSlotAsync(connection, transaction, moving.Pkid, request.TargetSlot, cancellationToken);
        }

        var movingAfter = await GetByIdAsync(connection, transaction, moving.Pkid, cancellationToken);
        var occupantAfter = occupantPkid is null
            ? null
            : await GetByIdAsync(connection, transaction, occupantPkid.Value, cancellationToken);

        transaction.Commit();

        // A swap moves two rows, so it writes two audit rows — the parking slot is an
        // implementation detail of the exchange and never appears, because the diff only
        // compares the committed before and after.
        await _rowAudit.LogUpdateAsync(AuditTableName, moving, movingAfter!, cancellationToken);
        if (occupantBefore is not null && occupantAfter is not null)
        {
            await _rowAudit.LogUpdateAsync(AuditTableName, occupantBefore, occupantAfter, cancellationToken);
        }

        return true;
    }

    private static Task SetSlotAsync(
        IDbConnection connection, IDbTransaction transaction, int pkid, byte slot, CancellationToken cancellationToken)
        => connection.ExecuteAsync(new CommandDefinition(
            "UPDATE FeaturedPromoItem SET Slot = @Slot WHERE pkid = @Pkid",
            new { Pkid = pkid, Slot = slot }, transaction, cancellationToken: cancellationToken));
}
