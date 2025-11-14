/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('logic_files', (table) => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.text('content').notNullable();
      table.string('vendor').defaultTo('neutral');
      table.timestamp('last_modified').defaultTo(knex.fn.now());
      table.string('author').defaultTo('Engineer');
      table.text('snapshot');
      table.timestamps(true, true);
    })
    .createTable('tags', (table) => {
      table.string('id').primary();
      table.string('name').unique().notNullable();
      table.string('type').notNullable();
      table.text('value');
      table.string('address');
      table.timestamp('last_update').defaultTo(knex.fn.now());
      table.boolean('persist').defaultTo(true);
      table.string('source').defaultTo('shadow');
      table.text('metadata');
      table.timestamps(true, true);
    })
    .createTable('sync_events', (table) => {
      table.string('id').primary();
      table.string('type').notNullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());
      table.text('payload');
      table.string('source');
      table.timestamps(true, true);
    })
    .createTable('user_sessions', (table) => {
      table.string('id').primary();
      table.text('editor_state');
      table.text('open_tabs');
      table.text('settings');
      table.timestamp('last_accessed').defaultTo(knex.fn.now());
      table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('user_sessions')
    .dropTableIfExists('sync_events')
    .dropTableIfExists('tags')
    .dropTableIfExists('logic_files');
};