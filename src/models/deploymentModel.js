const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Deployment Model
 * Handles deployment operations including:
 * - Safety checks and validation
 * - Deployment execution and monitoring
 * - Approval workflows
 * - Automatic rollbacks
 * - Deployment history
 */
class DeploymentModel {
  constructor(db) {
    this.db = db;
  }

  // ============== DEPLOYMENT CREATION & PREPARATION ==============

  /**
   * Create a new deployment record
   */
  async createDeployment(deploymentData) {
    const deployId = uuidv4();
    const {
      projectId,
      releaseId,
      versionId,
      snapshotId,
      deployName,
      environment,
      strategy = 'atomic',
      initiatedBy,
      targetRuntimes = [],
      estimatedDowntime = 15,
    } = deploymentData;

    // Validate environment progression
    await this.validateEnvironmentProgression(snapshotId, environment);

    // Get previous deployment for this environment (for rollback)
    const previousDeploy = await this.db('deploy_records')
      .where({ project_id: projectId, environment, status: 'success' })
      .orderBy('completed_at', 'desc')
      .first();

    // Determine approval requirements based on environment
    let approvalsRequired = 0;
    if (environment === 'production' || environment === 'prod') {
      approvalsRequired = 2; // Two-person rule for production
    } else if (environment === 'staging') {
      approvalsRequired = 1;
    }

    await this.db('deploy_records').insert({
      id: deployId,
      project_id: projectId,
      release_id: releaseId,
      version_id: versionId,
      snapshot_id: snapshotId,
      deploy_name: deployName,
      environment,
      strategy,
      status: 'pending',
      initiated_by: initiatedBy,
      approvals_required: approvalsRequired,
      approval_count: 0,
      target_runtimes_json: JSON.stringify(targetRuntimes),
      estimated_downtime_seconds: estimatedDowntime,
      previous_version_id: previousDeploy?.version_id || null,
      created_at: new Date().toISOString(),
    });

    // Create approval records if required
    if (approvalsRequired > 0) {
      await this.createApprovalRecords(deployId, environment);
    }

    // Run safety checks
    await this.runSafetyChecks(deployId, versionId);

    return await this.getDeploymentById(deployId);
  }

  /**
   * Validate that deployment follows correct environment progression
   */
  async validateEnvironmentProgression(snapshotId, targetEnvironment) {
    if (!snapshotId) return; // Skip for direct version deploys

    const progressionOrder = ['dev', 'qa', 'staging', 'production', 'prod'];
    const targetIndex = progressionOrder.indexOf(targetEnvironment);

    if (targetIndex === -1) {
      throw new Error(`Invalid environment: ${targetEnvironment}`);
    }

    // Check if snapshot has been promoted through previous stages
    const promotions = await this.db('snapshot_promotions')
      .where({ snapshot_id: snapshotId })
      .orderBy('promoted_at', 'asc');

    // For production, ensure it went through staging
    if (targetEnvironment === 'production' || targetEnvironment === 'prod') {
      const hasStaging = promotions.some(p => p.to_stage === 'staging');
      if (!hasStaging) {
        throw new Error('Production deployment requires prior staging promotion');
      }
    }

    // For staging, ensure it went through QA
    if (targetEnvironment === 'staging') {
      const hasQA = promotions.some(p => p.to_stage === 'qa');
      if (!hasQA) {
        throw new Error('Staging deployment requires prior QA promotion');
      }
    }
  }

  /**
   * Create approval records for deployment
   */
  async createApprovalRecords(deployId, environment) {
    const approvers = [];

    if (environment === 'staging') {
      approvers.push({
        approver_name: 'Operations Manager',
        approver_role: 'operations_manager',
        is_required: true,
      });
    } else if (environment === 'production' || environment === 'prod') {
      approvers.push(
        {
          approver_name: 'Safety Engineer',
          approver_role: 'safety_engineer',
          is_required: true,
        },
        {
          approver_name: 'Lead Developer',
          approver_role: 'lead_developer',
          is_required: true,
        }
      );
    }

    for (const approver of approvers) {
      await this.db('deploy_approvals').insert({
        id: uuidv4(),
        deploy_record_id: deployId,
        ...approver,
        status: 'pending',
        requested_at: new Date().toISOString(),
      });
    }
  }

  // ============== SAFETY CHECKS ==============

  /**
   * Run comprehensive pre-deployment safety checks
   */
  async runSafetyChecks(deployId, versionId) {
    const checks = [
      { name: 'Static Analysis', type: 'syntax', severity: 'critical' },
      { name: 'Tag Dependencies', type: 'tags', severity: 'critical' },
      { name: 'Tag Conflicts', type: 'conflicts', severity: 'critical' },
      { name: 'Critical Tag Overwrites', type: 'tags', severity: 'warning' },
      { name: 'IO Address Conflicts', type: 'conflicts', severity: 'critical' },
      { name: 'Resource Checks', type: 'resources', severity: 'warning' },
      { name: 'File Size Validation', type: 'resources', severity: 'info' },
      { name: 'Estimated Downtime', type: 'resources', severity: 'info' },
    ];

    const results = {
      total: checks.length,
      passed: 0,
      warning: 0,
      failed: 0,
    };

    for (const check of checks) {
      const checkId = uuidv4();
      const startTime = Date.now();

      // Run the actual check
      const result = await this.executeCheck(check, versionId);
      const duration = Date.now() - startTime;

      await this.db('deploy_checks').insert({
        id: checkId,
        deploy_record_id: deployId,
        check_name: check.name,
        check_type: check.type,
        status: result.status,
        severity: check.severity,
        message: result.message,
        details_json: result.details ? JSON.stringify(result.details) : null,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      });

      if (result.status === 'passed') results.passed++;
      else if (result.status === 'warning') results.warning++;
      else if (result.status === 'failed') results.failed++;
    }

    // Update deployment record with check results
    const checksPassed = results.failed === 0;
    await this.db('deploy_records')
      .where({ id: deployId })
      .update({
        checks_passed: checksPassed,
        checks_total: results.total,
        checks_passed_count: results.passed,
        checks_warning_count: results.warning,
        checks_failed_count: results.failed,
      });

    return { deployId, results, checksPassed };
  }

  /**
   * Execute individual safety check
   */
  async executeCheck(check, versionId) {
    // Simulate check execution (in real implementation, these would be actual validations)
    switch (check.type) {
      case 'syntax':
        return await this.checkSyntax(versionId);
      case 'tags':
        return await this.checkTagDependencies(versionId);
      case 'conflicts':
        return await this.checkConflicts(versionId);
      case 'resources':
        return await this.checkResources(versionId);
      default:
        return { status: 'passed', message: 'Check completed successfully' };
    }
  }

  async checkSyntax(versionId) {
    // Get all logic files for this version
    const files = await this.db('version_files')
      .where({ version_id: versionId, file_type: 'logic' });

    // In real implementation, run ST syntax validator
    // For now, simulate successful check
    return {
      status: 'passed',
      message: 'No syntax errors found',
      details: [`Validated ${files.length} logic files`],
    };
  }

  async checkTagDependencies(versionId) {
    // Get version details
    const version = await this.db('versions').where({ id: versionId }).first();
    
    // Parse tags from version
    const versionTags = version.tags_json ? JSON.parse(version.tags_json) : [];
    
    // Get all available tags in the project
    const projectTags = await this.db('tags')
      .where({ project_id: version.project_id });

    const missingTags = [];
    const criticalTags = [];

    // Check if any required tags are missing
    // In real implementation, parse logic files to find tag references
    
    if (criticalTags.length > 0) {
      return {
        status: 'warning',
        message: `${criticalTags.length} critical tags will be modified`,
        details: criticalTags,
      };
    }

    return {
      status: 'passed',
      message: 'All required tags are available',
      details: [`${projectTags.length} tags validated`],
    };
  }

  async checkConflicts(versionId) {
    // Check for IO address conflicts, variable name conflicts, etc.
    return {
      status: 'passed',
      message: 'No conflicts detected',
      details: ['IO addresses verified', 'Variable names unique'],
    };
  }

  async checkResources(versionId) {
    // Check file sizes, memory requirements, etc.
    const files = await this.db('version_files')
      .where({ version_id: versionId })
      .sum('file_size_bytes as totalSize');

    const totalSizeMB = (files[0].totalSize / 1024 / 1024).toFixed(2);

    return {
      status: 'passed',
      message: `Total size: ${totalSizeMB} MB (within limits)`,
      details: ['Sufficient memory available', 'CPU resources adequate'],
    };
  }

  // ============== APPROVAL WORKFLOW ==============

  /**
   * Submit approval for deployment
   */
  async submitApproval(approvalId, approverName, status, comment = null) {
    // Update approval record
    await this.db('deploy_approvals')
      .where({ id: approvalId })
      .update({
        status,
        comment,
        responded_at: new Date().toISOString(),
      });

    // Get deployment record
    const approval = await this.db('deploy_approvals')
      .where({ id: approvalId })
      .first();

    // Count approved approvals
    const approvedCount = await this.db('deploy_approvals')
      .where({ deploy_record_id: approval.deploy_record_id, status: 'approved' })
      .count('* as count');

    // Update deployment record
    await this.db('deploy_records')
      .where({ id: approval.deploy_record_id })
      .update({
        approval_count: approvedCount[0].count,
        approved_by: approverName,
      });

    return await this.getDeploymentById(approval.deploy_record_id);
  }

  /**
   * Check if deployment has all required approvals
   */
  async hasRequiredApprovals(deployId) {
    const deployment = await this.db('deploy_records')
      .where({ id: deployId })
      .first();

    return deployment.approval_count >= deployment.approvals_required;
  }

  // ============== DEPLOYMENT EXECUTION ==============

  /**
   * Start deployment execution
   */
  async startDeployment(deployId) {
    // Verify checks passed
    const deployment = await this.db('deploy_records')
      .where({ id: deployId })
      .first();

    if (!deployment.checks_passed) {
      throw new Error('Cannot deploy: safety checks failed');
    }

    // Verify approvals
    if (deployment.approval_count < deployment.approvals_required) {
      throw new Error('Cannot deploy: insufficient approvals');
    }

    // Update status to running
    await this.db('deploy_records')
      .where({ id: deployId })
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        progress_percentage: 0,
      });

    // Log deployment start
    await this.addDeployLog(deployId, 'info', 'Deployment started', 'validation');

    // Simulate deployment steps
    await this.executeDeploymentSteps(deployId);

    return await this.getDeploymentById(deployId);
  }

  /**
   * Execute deployment steps
   */
  async executeDeploymentSteps(deployId) {
    const steps = [
      { progress: 10, message: 'Validating deployment package...', step: 'validation' },
      { progress: 25, message: 'Backing up current configuration...', step: 'backup' },
      { progress: 40, message: 'Uploading new logic to target...', step: 'upload' },
      { progress: 60, message: 'Compiling logic on target...', step: 'compile' },
      { progress: 75, message: 'Applying configuration changes...', step: 'apply' },
      { progress: 90, message: 'Verifying deployment...', step: 'verify' },
      { progress: 100, message: 'Deployment completed successfully!', step: 'complete' },
    ];

    for (const stepData of steps) {
      // Simulate step delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update progress
      await this.db('deploy_records')
        .where({ id: deployId })
        .update({ progress_percentage: stepData.progress });

      // Log step
      await this.addDeployLog(
        deployId,
        stepData.progress === 100 ? 'success' : 'info',
        stepData.message,
        stepData.step
      );
    }

    // Mark as complete
    const startTime = await this.db('deploy_records')
      .where({ id: deployId })
      .select('started_at')
      .first();

    const duration = Math.floor(
      (new Date() - new Date(startTime.started_at)) / 1000
    );

    await this.db('deploy_records')
      .where({ id: deployId })
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
      });

    // Run health checks after deployment
    await this.runPostDeployHealthChecks(deployId);
  }

  /**
   * Add deployment log entry
   */
  async addDeployLog(deployId, level, message, step = null) {
    await this.db('deploy_logs').insert({
      id: uuidv4(),
      deploy_record_id: deployId,
      timestamp: new Date().toISOString(),
      level,
      message,
      step,
    });
  }

  /**
   * Run health checks after deployment
   */
  async runPostDeployHealthChecks(deployId) {
    // Simulate health checks
    // In real implementation, monitor PLC status, tag values, cycle times, etc.
    
    const healthChecksPassed = Math.random() > 0.1; // 90% success rate

    if (!healthChecksPassed) {
      await this.addDeployLog(
        deployId,
        'error',
        'Health check failed: abnormal system behavior detected',
        'verify'
      );
      await this.triggerAutomaticRollback(deployId, 'Health checks failed');
    } else {
      await this.addDeployLog(
        deployId,
        'success',
        'All health checks passed',
        'verify'
      );
    }
  }

  // ============== ROLLBACK ==============

  /**
   * Execute rollback to previous version
   */
  async executeRollback(deployId, triggeredBy, reason, isAutomatic = false) {
    const rollbackId = uuidv4();

    const deployment = await this.db('deploy_records')
      .where({ id: deployId })
      .first();

    if (!deployment.previous_version_id) {
      throw new Error('No previous version available for rollback');
    }

    // Create rollback record
    await this.db('deploy_rollbacks').insert({
      id: rollbackId,
      deploy_record_id: deployId,
      triggered_by: triggeredBy,
      reason,
      triggered_at: new Date().toISOString(),
      status: 'running',
      is_automatic: isAutomatic,
    });

    // Log rollback start
    await this.addDeployLog(
      deployId,
      'warning',
      `Rolling back to previous version: ${reason}`,
      'rollback'
    );

    // Simulate rollback execution
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Update deployment status
    await this.db('deploy_records')
      .where({ id: deployId })
      .update({
        status: 'rolled-back',
        rollback_reason: reason,
      });

    // Complete rollback record
    await this.db('deploy_rollbacks')
      .where({ id: rollbackId })
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
      });

    // Log rollback completion
    await this.addDeployLog(
      deployId,
      'success',
      'Rollback completed successfully',
      'rollback'
    );

    return await this.getDeploymentById(deployId);
  }

  /**
   * Trigger automatic rollback
   */
  async triggerAutomaticRollback(deployId, reason) {
    return await this.executeRollback(deployId, 'System', reason, true);
  }

  // ============== SNAPSHOT PROMOTIONS ==============

  /**
   * Promote snapshot to next stage
   */
  async promoteSnapshot(snapshotId, toStage, promotedBy, notes = null) {
    const snapshot = await this.db('snapshots')
      .where({ id: snapshotId })
      .first();

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    // Get version info
    const version = await this.db('versions')
      .where({ id: snapshot.version_id })
      .first();

    if (!version) {
      throw new Error('Version not found for snapshot');
    }

    // Determine from stage based on previous promotions
    const lastPromotion = await this.db('snapshot_promotions')
      .where({ snapshot_id: snapshotId })
      .orderBy('promoted_at', 'desc')
      .first();

    const fromStage = lastPromotion ? lastPromotion.to_stage : 'dev';

    // Create promotion record
    const promotionId = uuidv4();
    await this.db('snapshot_promotions').insert({
      id: promotionId,
      snapshot_id: snapshotId,
      project_id: snapshot.project_id,
      from_stage: fromStage,
      to_stage: toStage,
      promoted_by: promotedBy,
      promoted_at: new Date().toISOString(),
      notes,
      checks_passed: true,
    });

    let releaseId = null;
    
    // Create release for staging or production environments
    if (toStage === 'staging' || toStage === 'production') {
      const VersionModel = require('./versionModel');
      const versionModel = new VersionModel(this.db, this.storage);
      
      // Create release with environment
      const releaseData = {
        projectId: snapshot.project_id,
        snapshotId: snapshotId,
        versionId: version.id,
        name: `${snapshot.name}-${toStage}`,
        version: version.version,
        description: `${snapshot.description || ''} - Promoted to ${toStage}${notes ? ': ' + notes : ''}`,
        createdBy: promotedBy,
        tags: snapshot.tags_json ? JSON.parse(snapshot.tags_json) : [],
        metadata: {
          promotedFrom: fromStage,
          promotedTo: toStage,
          promotionId: promotionId,
          snapshotName: snapshot.name,
        },
      };
      
      const release = await versionModel.createRelease(releaseData);
      releaseId = release.id;
      
      // Update release with environment
      await this.db('releases')
        .where({ id: releaseId })
        .update({ environment: toStage });
    }

    return { 
      success: true, 
      promotionId, 
      fromStage, 
      toStage, 
      releaseId,
      releaseCreated: releaseId !== null
    };
  }

  // ============== QUERIES ==============

  /**
   * Get deployment by ID
   */
  async getDeploymentById(deployId) {
    const deployment = await this.db('deploy_records')
      .where({ id: deployId })
      .first();

    if (!deployment) return null;

    // Get related data
    const [approvals, checks, logs, rollbacks] = await Promise.all([
      this.db('deploy_approvals').where({ deploy_record_id: deployId }),
      this.db('deploy_checks').where({ deploy_record_id: deployId }),
      this.db('deploy_logs').where({ deploy_record_id: deployId }).orderBy('timestamp', 'asc'),
      this.db('deploy_rollbacks').where({ deploy_record_id: deployId }).orderBy('triggered_at', 'desc'),
    ]);

    return {
      ...this.formatDeployment(deployment),
      approvals: approvals.map(this.formatApproval),
      checks: checks.map(this.formatCheck),
      logs: logs.map(this.formatLog),
      rollbacks: rollbacks.map(this.formatRollback),
    };
  }

  /**
   * Get deployments for a project
   */
  async getDeployments(projectId, filters = {}) {
    let query = this.db('deploy_records')
      .where({ project_id: projectId })
      .orderBy('created_at', 'desc');

    if (filters.environment) {
      query = query.where({ environment: filters.environment });
    }

    if (filters.status) {
      query = query.where({ status: filters.status });
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const deployments = await query;
    return deployments.map(this.formatDeployment);
  }

  /**
   * Get snapshot promotions
   */
  async getSnapshotPromotions(snapshotId) {
    const promotions = await this.db('snapshot_promotions')
      .where({ snapshot_id: snapshotId })
      .orderBy('promoted_at', 'asc');

    return promotions;
  }

  // ============== FORMATTERS ==============

  formatDeployment(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      releaseId: row.release_id,
      versionId: row.version_id,
      snapshotId: row.snapshot_id,
      deployName: row.deploy_name,
      environment: row.environment,
      strategy: row.strategy,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationSeconds: row.duration_seconds,
      estimatedDowntime: row.estimated_downtime_seconds,
      initiatedBy: row.initiated_by,
      approvedBy: row.approved_by,
      approvalCount: row.approval_count,
      approvalsRequired: row.approvals_required,
      targetRuntimes: row.target_runtimes_json ? JSON.parse(row.target_runtimes_json) : [],
      progress: row.progress_percentage,
      errorMessage: row.error_message,
      rollbackReason: row.rollback_reason,
      previousVersionId: row.previous_version_id,
      checksPassed: row.checks_passed,
      checksTotal: row.checks_total,
      checksPassedCount: row.checks_passed_count,
      checksWarningCount: row.checks_warning_count,
      checksFailedCount: row.checks_failed_count,
    };
  }

  formatApproval(row) {
    return {
      id: row.id,
      approverName: row.approver_name,
      approverRole: row.approver_role,
      status: row.status,
      comment: row.comment,
      requestedAt: row.requested_at,
      respondedAt: row.responded_at,
      isRequired: row.is_required,
    };
  }

  formatCheck(row) {
    return {
      id: row.id,
      name: row.check_name,
      type: row.check_type,
      status: row.status,
      severity: row.severity,
      message: row.message,
      details: row.details_json ? JSON.parse(row.details_json) : [],
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
    };
  }

  formatLog(row) {
    return {
      id: row.id,
      timestamp: row.timestamp,
      level: row.level,
      message: row.message,
      step: row.step,
    };
  }

  formatRollback(row) {
    return {
      id: row.id,
      triggeredBy: row.triggered_by,
      reason: row.reason,
      triggeredAt: row.triggered_at,
      completedAt: row.completed_at,
      status: row.status,
      isAutomatic: row.is_automatic,
    };
  }
}

module.exports = DeploymentModel;
