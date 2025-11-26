/**
 * Deployment System Migration
 * Creates tables for deployment workflow:
 * - deploy_records: Track all deployments with status and metadata
 * - deploy_approvals: Multi-person approval workflow
 * - deploy_checks: Pre-deployment safety checks
 * - deploy_logs: Real-time deployment logs
 * - deploy_rollbacks: Rollback history
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    // Deploy Records - Main deployment tracking
    .createTable('deploy_records', (table) => {
      table.string('id').primary();
      table.string('project_id').notNullable();
      table.string('release_id').notNullable();
      table.string('version_id').notNullable();
      table.string('snapshot_id').nullable();
      
      // Deployment metadata
      table.string('deploy_name').notNullable();
      table.string('environment').notNullable(); // shadow, qa, staging, production
      table.string('strategy').notNullable().defaultTo('atomic'); // atomic, canary, staged
      table.string('status').notNullable().defaultTo('pending'); // pending, running, success, failed, rolled-back
      
      // Timing
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.integer('duration_seconds').nullable();
      table.integer('estimated_downtime_seconds').defaultTo(0);
      
      // User tracking
      table.string('initiated_by').notNullable();
      table.string('approved_by').nullable();
      table.integer('approval_count').defaultTo(0);
      table.integer('approvals_required').defaultTo(1);
      
      // Target runtime
      table.text('target_runtimes_json'); // JSON array of runtime IDs
      
      // Results
      table.integer('progress_percentage').defaultTo(0);
      table.text('error_message').nullable();
      table.text('rollback_reason').nullable();
      table.string('previous_version_id').nullable(); // for rollback
      
      // Safety checks
      table.boolean('checks_passed').defaultTo(false);
      table.integer('checks_total').defaultTo(0);
      table.integer('checks_passed_count').defaultTo(0);
      table.integer('checks_warning_count').defaultTo(0);
      table.integer('checks_failed_count').defaultTo(0);
      
      // Metadata
      table.text('metadata_json');
      table.text('tags_json');
      
      // Foreign keys
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      table.foreign('release_id').references('releases.id').onDelete('RESTRICT');
      table.foreign('version_id').references('versions.id').onDelete('RESTRICT');
      table.foreign('snapshot_id').references('snapshots.id').onDelete('SET NULL');
      table.foreign('previous_version_id').references('versions.id').onDelete('SET NULL');
      
      // Indexes
      table.index(['project_id', 'environment']);
      table.index(['project_id', 'status']);
      table.index(['release_id']);
      table.index(['created_at']);
    })
    
    // Deploy Approvals - Multi-person approval workflow
    .createTable('deploy_approvals', (table) => {
      table.string('id').primary();
      table.string('deploy_record_id').notNullable();
      table.string('approver_name').notNullable();
      table.string('approver_role').notNullable(); // operations_manager, safety_engineer, lead_developer
      table.string('status').notNullable().defaultTo('pending'); // pending, approved, rejected
      table.text('comment').nullable();
      table.timestamp('requested_at').defaultTo(knex.fn.now());
      table.timestamp('responded_at').nullable();
      table.boolean('is_required').defaultTo(true);
      
      // Foreign keys
      table.foreign('deploy_record_id').references('deploy_records.id').onDelete('CASCADE');
      
      // Indexes
      table.index(['deploy_record_id', 'status']);
      table.index(['approver_name']);
    })
    
    // Deploy Checks - Pre-deployment safety validation
    .createTable('deploy_checks', (table) => {
      table.string('id').primary();
      table.string('deploy_record_id').notNullable();
      table.string('check_name').notNullable();
      table.string('check_type').notNullable(); // syntax, tags, resources, conflicts, security
      table.string('status').notNullable().defaultTo('pending'); // pending, running, passed, warning, failed
      table.string('severity').notNullable().defaultTo('critical'); // critical, warning, info
      table.text('message').nullable();
      table.text('details_json').nullable(); // JSON array of detailed issues
      
      // Timing
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.integer('duration_ms').nullable();
      
      // Foreign keys
      table.foreign('deploy_record_id').references('deploy_records.id').onDelete('CASCADE');
      
      // Indexes
      table.index(['deploy_record_id', 'status']);
      table.index(['check_type']);
    })
    
    // Deploy Logs - Real-time deployment logs
    .createTable('deploy_logs', (table) => {
      table.string('id').primary();
      table.string('deploy_record_id').notNullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());
      table.string('level').notNullable(); // info, warning, error, success
      table.text('message').notNullable();
      table.string('step').nullable(); // validation, backup, upload, compile, apply, verify
      table.text('metadata_json').nullable();
      
      // Foreign keys
      table.foreign('deploy_record_id').references('deploy_records.id').onDelete('CASCADE');
      
      // Indexes
      table.index(['deploy_record_id', 'timestamp']);
      table.index(['level']);
    })
    
    // Deploy Rollbacks - Rollback history and tracking
    .createTable('deploy_rollbacks', (table) => {
      table.string('id').primary();
      table.string('deploy_record_id').notNullable();
      table.string('triggered_by').notNullable(); // user or automatic
      table.string('reason').notNullable();
      table.timestamp('triggered_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at').nullable();
      table.string('status').notNullable().defaultTo('pending'); // pending, running, success, failed
      table.boolean('is_automatic').defaultTo(false);
      table.text('rollback_details_json').nullable();
      table.text('error_message').nullable();
      
      // Health check data that triggered rollback
      table.text('health_check_failures_json').nullable();
      
      // Foreign keys
      table.foreign('deploy_record_id').references('deploy_records.id').onDelete('CASCADE');
      
      // Indexes
      table.index(['deploy_record_id']);
      table.index(['triggered_at']);
      table.index(['is_automatic']);
    })
    
    // Snapshot Promotions - Track snapshot lifecycle through stages
    .createTable('snapshot_promotions', (table) => {
      table.string('id').primary();
      table.string('snapshot_id').notNullable();
      table.string('project_id').notNullable();
      table.string('from_stage').notNullable(); // dev, qa, staging, prod
      table.string('to_stage').notNullable();
      table.string('promoted_by').notNullable();
      table.timestamp('promoted_at').defaultTo(knex.fn.now());
      table.text('notes').nullable();
      table.boolean('checks_passed').defaultTo(false);
      table.text('checks_summary_json').nullable();
      
      // Foreign keys
      table.foreign('snapshot_id').references('snapshots.id').onDelete('CASCADE');
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      
      // Indexes
      table.index(['snapshot_id', 'to_stage']);
      table.index(['project_id', 'promoted_at']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('snapshot_promotions')
    .dropTableIfExists('deploy_rollbacks')
    .dropTableIfExists('deploy_logs')
    .dropTableIfExists('deploy_checks')
    .dropTableIfExists('deploy_approvals')
    .dropTableIfExists('deploy_records');
};
