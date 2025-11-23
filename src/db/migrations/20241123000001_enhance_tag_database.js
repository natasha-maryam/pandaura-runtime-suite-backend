/**
 * Migration: Enhance Tag Database with Industrial Features
 * - User Defined Types (UDTs)
 * - Tag hierarchy and scoping
 * - Lifecycle management
 * - Validation rules
 * - Aliases
 * - Dependencies tracking
 * - Permissions and approval workflows
 */

exports.up = async function(knex) {
  // Create User Defined Types (UDT) table
  await knex.schema.createTable('udts', (table) => {
    table.uuid('id').primary()
    table.string('name').notNullable().unique()
    table.text('description')
    table.json('members') // Array of { name, type, udtType, arraySize, defaultValue, description }
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.string('created_by')
    table.uuid('project_id').references('id').inTable('projects').onDelete('CASCADE')
    table.index(['project_id'])
  })

  // Create Tag Hierarchy table
  await knex.schema.createTable('tag_hierarchy', (table) => {
    table.uuid('id').primary()
    table.string('name').notNullable()
    table.enum('type', ['area', 'equipment', 'routine', 'tag']).notNullable()
    table.uuid('parent_id').references('id').inTable('tag_hierarchy').onDelete('CASCADE')
    table.uuid('tag_id').references('id').inTable('tags').onDelete('CASCADE')
    table.uuid('project_id').references('id').inTable('projects').onDelete('CASCADE')
    table.integer('sort_order').defaultTo(0)
    table.index(['parent_id'])
    table.index(['project_id'])
    table.index(['tag_id'])
  })

  // Create Validation Rules table
  await knex.schema.createTable('tag_validation_rules', (table) => {
    table.uuid('id').primary()
    table.uuid('tag_id').references('id').inTable('tags').onDelete('CASCADE')
    table.enum('type', ['min', 'max', 'range', 'regex', 'custom']).notNullable()
    table.text('value') // JSON value
    table.text('message')
    table.enum('severity', ['error', 'warning', 'info']).defaultTo('error')
    table.boolean('enabled').defaultTo(true)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index(['tag_id'])
  })

  // Create Tag Aliases table
  await knex.schema.createTable('tag_aliases', (table) => {
    table.uuid('id').primary()
    table.uuid('tag_id').references('id').inTable('tags').onDelete('CASCADE')
    table.string('alias').notNullable()
    table.string('vendor_address')
    table.text('description')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.unique(['tag_id', 'alias'])
    table.index(['tag_id'])
    table.index(['alias'])
  })

  // Create Tag Dependencies table
  await knex.schema.createTable('tag_dependencies', (table) => {
    table.uuid('id').primary()
    table.uuid('tag_id').references('id').inTable('tags').onDelete('CASCADE')
    table.uuid('depends_on_tag_id').references('id').inTable('tags').onDelete('CASCADE')
    table.enum('usage_type', ['read', 'write', 'readwrite']).notNullable()
    table.uuid('file_id').references('id').inTable('logic_files').onDelete('CASCADE')
    table.string('file_name')
    table.string('routine')
    table.integer('line_number')
    table.timestamp('discovered_at').defaultTo(knex.fn.now())
    table.index(['tag_id'])
    table.index(['depends_on_tag_id'])
    table.index(['file_id'])
  })

  // Create Bulk Operations table (for tracking bulk operations)
  await knex.schema.createTable('bulk_operations', (table) => {
    table.uuid('id').primary()
    table.enum('operation', ['create', 'update', 'delete', 'rename', 'copy']).notNullable()
    table.json('tag_ids') // Array of tag IDs
    table.json('changes') // Changes to apply
    table.boolean('dry_run').defaultTo(true)
    table.json('preview') // Preview results
    table.enum('status', ['pending', 'running', 'completed', 'failed']).defaultTo('pending')
    table.uuid('project_id').references('id').inTable('projects').onDelete('CASCADE')
    table.string('created_by')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('completed_at')
    table.index(['project_id'])
    table.index(['status'])
  })

  // Create Tag Refactoring History table
  await knex.schema.createTable('tag_refactorings', (table) => {
    table.uuid('id').primary()
    table.uuid('tag_id').references('id').inTable('tags').onDelete('CASCADE')
    table.string('old_name').notNullable()
    table.string('new_name').notNullable()
    table.json('affected_files') // Array of file changes
    table.boolean('requires_approval').defaultTo(false)
    table.boolean('approved').defaultTo(false)
    table.string('approved_by')
    table.timestamp('approved_at')
    table.enum('status', ['pending', 'approved', 'applied', 'rejected']).defaultTo('pending')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('applied_at')
    table.index(['tag_id'])
    table.index(['status'])
  })

  // Enhance existing tags table with new columns
  await knex.schema.alterTable('tags', (table) => {
    // UDT support
    table.string('udt_type') // Reference to UDT name if type is 'UDT'
    
    // Scope and lifecycle
    table.enum('scope', ['global', 'program', 'task']).defaultTo('global')
    table.boolean('scope_locked').defaultTo(false)
    table.enum('lifecycle', ['draft', 'active', 'deprecated', 'archived']).defaultTo('active')
    
    // Hierarchy
    table.string('hierarchy_path') // e.g., "Area1/Equipment2/Routine3"
    table.string('area')
    table.string('equipment')
    table.string('routine')
    
    // Alarm thresholds
    table.decimal('alarm_low')
    table.decimal('alarm_high')
    table.decimal('alarm_critical')
    
    // Permissions
    table.boolean('read_only').defaultTo(false)
    table.boolean('requires_approval').defaultTo(false)
    table.json('allowed_roles') // Array of role names
    
    // Metadata extensions
    table.string('vendor') // 'rockwell', 'siemens', 'beckhoff', 'neutral'
    table.boolean('imported').defaultTo(false)
    table.integer('version').defaultTo(1)
    
    // Indexes for performance
    table.index(['scope'])
    table.index(['lifecycle'])
    table.index(['area'])
    table.index(['equipment'])
    table.index(['udt_type'])
    table.index(['hierarchy_path'])
  })
}

exports.down = async function(knex) {
  // Remove new columns from tags table
  await knex.schema.alterTable('tags', (table) => {
    table.dropColumn('udt_type')
    table.dropColumn('scope')
    table.dropColumn('scope_locked')
    table.dropColumn('lifecycle')
    table.dropColumn('hierarchy_path')
    table.dropColumn('area')
    table.dropColumn('equipment')
    table.dropColumn('routine')
    table.dropColumn('alarm_low')
    table.dropColumn('alarm_high')
    table.dropColumn('alarm_critical')
    table.dropColumn('read_only')
    table.dropColumn('requires_approval')
    table.dropColumn('allowed_roles')
    table.dropColumn('vendor')
    table.dropColumn('imported')
    table.dropColumn('version')
  })

  // Drop new tables in reverse order
  await knex.schema.dropTableIfExists('tag_refactorings')
  await knex.schema.dropTableIfExists('bulk_operations')
  await knex.schema.dropTableIfExists('tag_dependencies')
  await knex.schema.dropTableIfExists('tag_aliases')
  await knex.schema.dropTableIfExists('tag_validation_rules')
  await knex.schema.dropTableIfExists('tag_hierarchy')
  await knex.schema.dropTableIfExists('udts')
}
