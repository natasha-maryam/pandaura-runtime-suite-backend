/**
 * Fix foreign key constraint in releases table
 * snapshot_id should reference snapshots.id, not versions.id
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .alterTable('releases', (table) => {
      // Drop the incorrect foreign key constraint
      table.dropForeign('snapshot_id');
      
      // Add the correct foreign key constraint
      table.foreign('snapshot_id').references('snapshots.id').onDelete('RESTRICT');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .alterTable('releases', (table) => {
      // Revert to the old (incorrect) constraint
      table.dropForeign('snapshot_id');
      table.foreign('snapshot_id').references('versions.id').onDelete('RESTRICT');
    });
};