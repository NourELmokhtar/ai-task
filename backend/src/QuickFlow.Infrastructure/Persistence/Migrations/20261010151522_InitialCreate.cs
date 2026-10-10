using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QuickFlow.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Hand-edited (M01): database default charset + case-insensitive collation.
            // Every table/column created by later migrations inherits it (case-insensitive title/name search).
            migrationBuilder.Sql(
                $"ALTER DATABASE CHARACTER SET {AppDbContext.DefaultCharSet} COLLATE {AppDbContext.DefaultCollation};");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
