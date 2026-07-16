namespace CMS.API.Models;

/// <summary>Slim JobCategory row for the Course "職務類別" multiselect. pkid is smallint.</summary>
public class JobCategoryLookup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}
