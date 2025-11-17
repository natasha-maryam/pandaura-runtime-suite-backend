const { v4: uuidv4 } = require('uuid');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('sync_events').del();
  await knex('tags').del();
  await knex('logic_files').del();

  // No sample logic files - start with empty database
  // await knex('logic_files').insert([]);

  // Insert sample tags - EMPTY by default, user must sync from Tag Database page
  // No tags inserted - start with empty database
};