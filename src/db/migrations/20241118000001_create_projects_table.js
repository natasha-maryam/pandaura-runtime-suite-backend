/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('projects', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('description');
      table.string('file_path').notNullable();
      table.text('connection_profile'); // JSON stringified
      table.timestamp('last_opened').defaultTo(knex.fn.now());
      table.timestamps(true, true); // creates created_at and updated_at
    })
    .then(() => {
      // Add project_id foreign key to existing tables
      return knex.schema.alterTable('logic_files', (table) => {
        table.string('project_id').nullable();
        table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      });
    })
    .then(() => {
      return knex.schema.alterTable('tags', (table) => {
        table.string('project_id').nullable();
        table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      });
    })
    .then(() => {
      return knex.schema.alterTable('sync_events', (table) => {
        table.string('project_id').nullable();
        table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      });
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .alterTable('sync_events', (table) => {
      table.dropForeign('project_id');
      table.dropColumn('project_id');
    })
    .then(() => {
      return knex.schema.alterTable('tags', (table) => {
        table.dropForeign('project_id');
        table.dropColumn('project_id');
      });
    })
    .then(() => {
      return knex.schema.alterTable('logic_files', (table) => {
        table.dropForeign('project_id');
        table.dropColumn('project_id');
      });
    })
    .then(() => {
      return knex.schema.dropTable('projects');
    });
};
