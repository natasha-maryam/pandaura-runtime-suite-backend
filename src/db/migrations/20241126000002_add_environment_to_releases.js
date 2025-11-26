/**
 * Add environment field to releases table
 * Releases are created when snapshots are promoted to staging or production
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .table('releases', (table) => {
      table.string('environment').nullable(); // staging, production
      table.index(['project_id', 'environment', 'status']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .table('releases', (table) => {
      table.dropIndex(['project_id', 'environment', 'status']);
      table.dropColumn('environment');
    });
};
