/**
 * Versioning System Migration
 * Creates tables for comprehensive version control:
 * - branches: Git-like branch management with stages
 * - versions: Immutable version history with metadata
 * - version_files: File-level tracking per version
 * - snapshots: Named snapshots for specific states
 * - releases: Signed, immutable release bundles
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Branches table - supports branch-like staging (dev, qa, staging, prod)
    .createTable('branches', (table) => {
      table.string('id').primary();
      table.string('project_id').notNullable();
      table.string('name').notNullable();
      table.string('stage').notNullable(); // main, dev, qa, staging, prod
      table.string('parent_branch_id').nullable();
      table.boolean('is_default').defaultTo(false);
      table.string('created_by').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.text('description');
      table.boolean('is_active').defaultTo(true);
      
      // Foreign keys
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      table.foreign('parent_branch_id').references('branches.id').onDelete('SET NULL');
      
      // Indexes
      table.index(['project_id', 'name']);
      table.index(['project_id', 'stage']);
      table.unique(['project_id', 'name']);
    })
    
    // Versions table - immutable version history
    .createTable('versions', (table) => {
      table.string('id').primary();
      table.string('project_id').notNullable();
      table.string('branch_id').nullable();
      table.string('version').notNullable(); // semver or custom
      table.string('author').notNullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());
      table.text('message'); // commit-like message
      table.string('status').notNullable().defaultTo('draft'); // draft, staged, released
      table.string('checksum').notNullable(); // SHA-256 of all files
      table.integer('files_changed').defaultTo(0);
      table.integer('lines_added').defaultTo(0);
      table.integer('lines_deleted').defaultTo(0);
      table.string('parent_version_id').nullable(); // for version chain
      table.text('tags_json'); // JSON array of tags
      table.text('metadata_json'); // JSON for extensibility
      
      // Approval workflow
      table.integer('approvals').defaultTo(0);
      table.integer('approvals_required').defaultTo(0);
      table.text('approvers_json'); // JSON array of approver info
      
      // Signing
      table.boolean('signed').defaultTo(false);
      table.text('signature');
      table.string('signed_by');
      table.timestamp('signed_at');
      
      // Size tracking for efficient storage
      table.bigInteger('total_size_bytes').defaultTo(0);
      table.bigInteger('compressed_size_bytes').defaultTo(0);
      
      // Foreign keys
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      table.foreign('branch_id').references('branches.id').onDelete('SET NULL');
      table.foreign('parent_version_id').references('versions.id').onDelete('SET NULL');
      
      // Indexes
      table.index(['project_id', 'timestamp']);
      table.index(['project_id', 'branch_id']);
      table.index(['project_id', 'status']);
      table.index(['checksum']);
      table.unique(['project_id', 'version']);
    })
    
    // Version Files table - tracks individual files per version
    .createTable('version_files', (table) => {
      table.string('id').primary();
      table.string('version_id').notNullable();
      table.string('file_path').notNullable(); // relative path in project
      table.string('file_type').notNullable(); // logic, tag, config, etc.
      table.string('change_type').notNullable(); // added, modified, deleted
      table.integer('lines_added').defaultTo(0);
      table.integer('lines_deleted').defaultTo(0);
      table.bigInteger('file_size_bytes').defaultTo(0);
      table.string('file_checksum').notNullable(); // SHA-256 of file
      
      // Storage information
      table.string('storage_path').notNullable(); // actual storage location
      table.boolean('is_compressed').defaultTo(false);
      table.boolean('is_delta').defaultTo(false); // delta from previous version
      table.string('delta_base_file_id').nullable(); // for delta compression
      
      // Diff preview (truncated for quick display)
      table.text('diff_preview'); // first 1000 chars of diff
      table.text('content_snapshot'); // full content or compressed
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Foreign keys
      table.foreign('version_id').references('versions.id').onDelete('CASCADE');
      table.foreign('delta_base_file_id').references('version_files.id').onDelete('SET NULL');
      
      // Indexes
      table.index(['version_id', 'file_path']);
      table.index(['file_checksum']);
      table.index(['change_type']);
    })
    
    // Snapshots table - named snapshots for easy reference
    .createTable('snapshots', (table) => {
      table.string('id').primary();
      table.string('project_id').notNullable();
      table.string('version_id').notNullable();
      table.string('name').notNullable();
      table.text('description');
      table.string('created_by').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.text('tags_json'); // JSON array
      table.text('metadata_json');
      
      // Foreign keys
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      table.foreign('version_id').references('versions.id').onDelete('CASCADE');
      
      // Indexes
      table.index(['project_id', 'name']);
      table.unique(['project_id', 'name']);
    })
    
    // Releases table - immutable signed release bundles
    .createTable('releases', (table) => {
      table.string('id').primary();
      table.string('project_id').notNullable();
      table.string('snapshot_id').notNullable();
      table.string('version_id').notNullable();
      table.string('name').notNullable();
      table.string('version').notNullable(); // release version
      table.text('description');
      table.string('created_by').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Signing (mandatory for releases)
      table.boolean('signed').defaultTo(false);
      table.text('signature');
      table.string('signed_by');
      table.timestamp('signed_at');
      
      // Release status
      table.string('status').notNullable().defaultTo('active'); // active, deprecated, archived
      table.text('tags_json');
      table.text('metadata_json');
      
      // Bundle information
      table.string('bundle_path'); // path to bundled archive
      table.bigInteger('bundle_size_bytes').defaultTo(0);
      table.string('bundle_checksum');
      
      // Deployment tracking
      table.integer('linked_deploys').defaultTo(0);
      table.timestamp('last_deployed_at');
      
      // Foreign keys
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      table.foreign('snapshot_id').references('snapshots.id').onDelete('RESTRICT');
      table.foreign('version_id').references('versions.id').onDelete('RESTRICT');
      
      // Indexes
      table.index(['project_id', 'status']);
      table.index(['project_id', 'created_at']);
      table.unique(['project_id', 'name']);
    })
    
    // Version History Changelog - for audit trail
    .createTable('version_changelog', (table) => {
      table.string('id').primary();
      table.string('version_id').notNullable();
      table.string('action').notNullable(); // created, approved, signed, promoted, etc.
      table.string('actor').notNullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());
      table.text('details_json');
      
      table.foreign('version_id').references('versions.id').onDelete('CASCADE');
      table.index(['version_id', 'timestamp']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('version_changelog')
    .dropTableIfExists('releases')
    .dropTableIfExists('snapshots')
    .dropTableIfExists('version_files')
    .dropTableIfExists('versions')
    .dropTableIfExists('branches');
};
