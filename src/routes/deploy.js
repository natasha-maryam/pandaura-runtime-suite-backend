const express = require('express');
const router = express.Router();
const { db } = require('../db/init-db');
const DeploymentModel = require('../models/deploymentModel');

// Initialize model
const deploymentModel = new DeploymentModel(db);

// Middleware to log requests
router.use((req, res, next) => {
  console.log('\n🚀 DEPLOYMENT ROUTE HIT:', req.method, req.path);
  next();
});

// ============== DEPLOYMENT CREATION & MANAGEMENT ==============

/**
 * POST /api/deploy/projects/:projectId/deployments
 * Create a new deployment
 */
router.post('/projects/:projectId/deployments', async (req, res) => {
  try {
    const { projectId } = req.params;
    const deploymentData = {
      ...req.body,
      projectId,
    };

    const deployment = await deploymentModel.createDeployment(deploymentData);
    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error creating deployment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/deploy/projects/:projectId/deployments
 * Get all deployments for a project
 */
router.get('/projects/:projectId/deployments', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { environment, status, limit } = req.query;

    const filters = {};
    if (environment) filters.environment = environment;
    if (status) filters.status = status;
    if (limit) filters.limit = parseInt(limit);

    const deployments = await deploymentModel.getDeployments(projectId, filters);
    res.json({ success: true, deployments });
  } catch (error) {
    console.error('Error fetching deployments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/deploy/deployments/:deployId
 * Get specific deployment details
 */
router.get('/deployments/:deployId', async (req, res) => {
  try {
    const { deployId } = req.params;
    const deployment = await deploymentModel.getDeploymentById(deployId);

    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error fetching deployment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deploy/deployments/:deployId/start
 * Start deployment execution
 */
router.post('/deployments/:deployId/start', async (req, res) => {
  try {
    const { deployId } = req.params;
    const deployment = await deploymentModel.startDeployment(deployId);
    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error starting deployment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deploy/deployments/:deployId/pause
 * Pause deployment execution
 */
router.post('/deployments/:deployId/pause', async (req, res) => {
  try {
    const { deployId } = req.params;
    
    await db('deploy_records')
      .where({ id: deployId })
      .update({ status: 'paused' });

    await deploymentModel.addDeployLog(
      deployId,
      'warning',
      'Deployment paused by user'
    );

    const deployment = await deploymentModel.getDeploymentById(deployId);
    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error pausing deployment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deploy/deployments/:deployId/cancel
 * Cancel deployment execution
 */
router.post('/deployments/:deployId/cancel', async (req, res) => {
  try {
    const { deployId } = req.params;
    
    await db('deploy_records')
      .where({ id: deployId })
      .update({ 
        status: 'failed',
        error_message: 'Deployment cancelled by user'
      });

    await deploymentModel.addDeployLog(
      deployId,
      'error',
      'Deployment cancelled by user'
    );

    const deployment = await deploymentModel.getDeploymentById(deployId);
    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error cancelling deployment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SAFETY CHECKS ==============

/**
 * GET /api/deploy/deployments/:deployId/checks
 * Get safety checks for deployment
 */
router.get('/deployments/:deployId/checks', async (req, res) => {
  try {
    const { deployId } = req.params;
    
    const checks = await db('deploy_checks')
      .where({ deploy_record_id: deployId })
      .orderBy('check_name', 'asc');

    res.json({ 
      success: true, 
      checks: checks.map(deploymentModel.formatCheck) 
    });
  } catch (error) {
    console.error('Error fetching deployment checks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deploy/deployments/:deployId/checks/rerun
 * Re-run safety checks
 */
router.post('/deployments/:deployId/checks/rerun', async (req, res) => {
  try {
    const { deployId } = req.params;
    
    const deployment = await db('deploy_records')
      .where({ id: deployId })
      .first();

    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }

    // Clear existing checks
    await db('deploy_checks').where({ deploy_record_id: deployId }).delete();

    // Run checks again
    const result = await deploymentModel.runSafetyChecks(
      deployId,
      deployment.version_id
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error re-running checks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== APPROVALS ==============

/**
 * GET /api/deploy/deployments/:deployId/approvals
 * Get approvals for deployment
 */
router.get('/deployments/:deployId/approvals', async (req, res) => {
  try {
    const { deployId } = req.params;
    
    const approvals = await db('deploy_approvals')
      .where({ deploy_record_id: deployId });

    res.json({ 
      success: true, 
      approvals: approvals.map(deploymentModel.formatApproval) 
    });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/deploy/approvals/:approvalId/submit
 * Submit approval decision
 */
router.post('/approvals/:approvalId/submit', async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { approverName, status, comment } = req.body;

    if (!approverName || !status) {
      return res.status(400).json({
        success: false,
        error: 'approverName and status are required',
      });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be "approved" or "rejected"',
      });
    }

    const deployment = await deploymentModel.submitApproval(
      approvalId,
      approverName,
      status,
      comment
    );

    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error submitting approval:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== DEPLOYMENT LOGS ==============

/**
 * GET /api/deploy/deployments/:deployId/logs
 * Get deployment logs
 */
router.get('/deployments/:deployId/logs', async (req, res) => {
  try {
    const { deployId } = req.params;
    const { limit, level } = req.query;

    let query = db('deploy_logs')
      .where({ deploy_record_id: deployId })
      .orderBy('timestamp', 'asc');

    if (level) {
      query = query.where({ level });
    }

    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const logs = await query;
    res.json({ 
      success: true, 
      logs: logs.map(deploymentModel.formatLog) 
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ROLLBACK ==============

/**
 * POST /api/deploy/deployments/:deployId/rollback
 * Execute rollback to previous version
 */
router.post('/deployments/:deployId/rollback', async (req, res) => {
  try {
    const { deployId } = req.params;
    const { triggeredBy, reason } = req.body;

    if (!triggeredBy || !reason) {
      return res.status(400).json({
        success: false,
        error: 'triggeredBy and reason are required',
      });
    }

    const deployment = await deploymentModel.executeRollback(
      deployId,
      triggeredBy,
      reason,
      false
    );

    res.json({ success: true, deployment });
  } catch (error) {
    console.error('Error executing rollback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/deploy/deployments/:deployId/rollbacks
 * Get rollback history
 */
router.get('/deployments/:deployId/rollbacks', async (req, res) => {
  try {
    const { deployId } = req.params;
    
    const rollbacks = await db('deploy_rollbacks')
      .where({ deploy_record_id: deployId })
      .orderBy('triggered_at', 'desc');

    res.json({ 
      success: true, 
      rollbacks: rollbacks.map(deploymentModel.formatRollback) 
    });
  } catch (error) {
    console.error('Error fetching rollbacks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SNAPSHOT PROMOTIONS ==============

/**
 * POST /api/deploy/snapshots/:snapshotId/promote
 * Promote snapshot to next stage
 */
router.post('/snapshots/:snapshotId/promote', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const { toStage, promotedBy, notes } = req.body;

    if (!toStage || !promotedBy) {
      return res.status(400).json({
        success: false,
        error: 'toStage and promotedBy are required',
      });
    }

    const validStages = ['qa', 'staging', 'production', 'prod'];
    if (!validStages.includes(toStage)) {
      return res.status(400).json({
        success: false,
        error: `Invalid stage. Must be one of: ${validStages.join(', ')}`,
      });
    }

    const result = await deploymentModel.promoteSnapshot(
      snapshotId,
      toStage,
      promotedBy,
      notes
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error promoting snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/deploy/snapshots/:snapshotId/promotions
 * Get promotion history for snapshot
 */
router.get('/snapshots/:snapshotId/promotions', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const promotions = await deploymentModel.getSnapshotPromotions(snapshotId);
    res.json({ success: true, promotions });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== DEPLOYMENT STATISTICS ==============

/**
 * GET /api/deploy/projects/:projectId/stats
 * Get deployment statistics
 */
router.get('/projects/:projectId/stats', async (req, res) => {
  try {
    const { projectId } = req.params;

    const [
      totalDeploys,
      successfulDeploys,
      failedDeploys,
      rolledBackDeploys,
      avgDuration,
    ] = await Promise.all([
      db('deploy_records').where({ project_id: projectId }).count('* as count'),
      db('deploy_records').where({ project_id: projectId, status: 'success' }).count('* as count'),
      db('deploy_records').where({ project_id: projectId, status: 'failed' }).count('* as count'),
      db('deploy_records').where({ project_id: projectId, status: 'rolled-back' }).count('* as count'),
      db('deploy_records')
        .where({ project_id: projectId, status: 'success' })
        .avg('duration_seconds as avg')
        .first(),
    ]);

    // Get environment breakdown
    const byEnvironment = await db('deploy_records')
      .where({ project_id: projectId })
      .select('environment')
      .count('* as count')
      .groupBy('environment');

    res.json({
      success: true,
      stats: {
        total: totalDeploys[0].count,
        successful: successfulDeploys[0].count,
        failed: failedDeploys[0].count,
        rolledBack: rolledBackDeploys[0].count,
        avgDurationSeconds: Math.round(avgDuration?.avg || 0),
        byEnvironment: byEnvironment.reduce((acc, row) => {
          acc[row.environment] = row.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error('Error fetching deployment stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
