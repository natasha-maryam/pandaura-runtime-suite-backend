/**
 * Add deployed_by field to releases table for tracking promotion history
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .table('releases', (table) => {
      table.string('deployed_by').nullable(); // who promoted the release
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .table('releases', (table) => {
      table.dropColumn('deployed_by');
    });
};