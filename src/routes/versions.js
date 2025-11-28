const express = require('express');
const router = express.Router();
const { db } = require('../db/init-db');
const VersionModel = require('../models/versionModel');

// Initialize model
const versionModel = new VersionModel(db);

// Middleware to log ALL requests to this router
router.use((req, res, next) => {
  console.log('\n🔵 VERSION ROUTE HIT:', req.method, req.path);
  console.log('Full URL:', req.originalUrl);
  next();
});

// ============== BRANCH ROUTES ==============

/**
 * GET /api/versions/projects/:projectId/branches
 * Get all branches for a project
 */
router.get('/projects/:projectId/branches', async (req, res) => {
  try {
    const { projectId } = req.params;
    const branches = await versionModel.getBranches(projectId);
    res.json({ success: true, branches });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/projects/:projectId/branches
 * Create a new branch
 */
router.post('/projects/:projectId/branches', async (req, res) => {
  try {
    const { projectId } = req.params;
    const branchData = {
      ...req.body,
      projectId,
    };

    const branch = await versionModel.createBranch(branchData);
    res.json({ success: true, branch });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/versions/branches/:branchId
 * Delete/deactivate a branch
 */
router.delete('/branches/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    const result = await versionModel.deleteBranch(branchId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== VERSION ROUTES ==============

/**
 * GET /api/versions/projects/:projectId/versions
 * Get all versions for a project
 */
router.get('/projects/:projectId/versions', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { branchId, status, limit } = req.query;

    const filters = {};
    if (branchId) filters.branchId = branchId;
    if (status) filters.status = status;
    if (limit) filters.limit = parseInt(limit);

    const versions = await versionModel.getVersions(projectId, filters);
    res.json({ success: true, versions });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/:versionId
 * Get a specific version with details
 */
router.get('/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;
    const version = await versionModel.getVersionById(versionId);

    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }

    res.json({ success: true, version });
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/projects/:projectId/versions
 * Create a new version
 */
router.post('/projects/:projectId/versions', async (req, res) => {
  console.log('\n========================================');
  console.log('🚀 VERSION CREATE API CALLED');
  console.log('========================================');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Project ID:', req.params.projectId);
  console.log('Body keys:', Object.keys(req.body));
  console.log('========================================\n');
  
  try {
    console.log('📦 Creating version for project:', req.params.projectId);
    console.log('📄 Files count:', req.body.files?.length || 0);
    
    const { projectId } = req.params;
    const versionData = {
      ...req.body,
      projectId,
    };

    const version = await versionModel.createVersion(versionData);
    console.log('✅ Version created successfully:', version.version);
    res.json({ success: true, version });
  } catch (error) {
    console.error('❌ Error creating version:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/versions/:versionId/status
 * Update version status
 */
router.patch('/:versionId/status', async (req, res) => {
  try {
    const { versionId } = req.params;
    const { status, actor } = req.body;

    if (!status || !actor) {
      return res.status(400).json({
        success: false,
        error: 'Status and actor are required',
      });
    }

    const version = await versionModel.updateVersionStatus(
      versionId,
      status,
      actor
    );
    res.json({ success: true, version });
  } catch (error) {
    console.error('Error updating version status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/:versionId/sign
 * Sign a version
 */
router.post('/:versionId/sign', async (req, res) => {
  try {
    const { versionId } = req.params;
    const { signedBy } = req.body;

    if (!signedBy) {
      return res.status(400).json({
        success: false,
        error: 'signedBy is required',
      });
    }

    const version = await versionModel.signVersion(versionId, signedBy);
    res.json({ success: true, version });
  } catch (error) {
    console.error('Error signing version:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/:versionId/approve
 * Approve a version
 */
router.post('/:versionId/approve', async (req, res) => {
  try {
    const { versionId } = req.params;
    const { approver } = req.body;

    if (!approver) {
      return res.status(400).json({
        success: false,
        error: 'approver is required',
      });
    }

    const version = await versionModel.approveVersion(versionId, approver);
    res.json({ success: true, version });
  } catch (error) {
    console.error('Error approving version:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/:versionId/files
 * Get all files for a version
 */
router.get('/:versionId/files', async (req, res) => {
  try {
    const { versionId } = req.params;
    const { filePath } = req.query;

    // If filePath query param provided, get specific file
    if (filePath) {
      const file = await versionModel.getVersionFileContent(versionId, filePath);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      return res.json({ success: true, file });
    }

    // Otherwise get all files
    const files = await versionModel.getVersionFiles(versionId);
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error fetching version files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/compare/:versionId1/:versionId2
 * Compare two versions
 */
router.get('/compare/:versionId1/:versionId2', async (req, res) => {
  try {
    const { versionId1, versionId2 } = req.params;
    console.log('🔀 Comparing versions:', { versionId1, versionId2 });

    const comparison = await versionModel.compareVersions(
      versionId1,
      versionId2
    );
    
    console.log('📊 Comparison result:', {
      hasFileChanges: !!comparison.fileChanges,
      fileChangesCount: comparison.fileChanges?.length || 0,
      hasSummary: !!comparison.summary,
      summary: comparison.summary
    });
    
    res.json({ success: true, comparison });
  } catch (error) {
    console.error('Error comparing versions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SNAPSHOT ROUTES ==============

/**
 * GET /api/versions/projects/:projectId/snapshots
 * Get all snapshots for a project
 */
router.get('/projects/:projectId/snapshots', async (req, res) => {
  try {
    const { projectId } = req.params;
    const snapshots = await versionModel.getSnapshots(projectId);
    res.json({ success: true, snapshots });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/snapshots/:snapshotId
 * Get a specific snapshot
 */
router.get('/snapshots/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const snapshot = await versionModel.getSnapshotById(snapshotId);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found',
      });
    }

    res.json({ success: true, snapshot });
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/projects/:projectId/snapshots
 * Create a snapshot
 */
router.post('/projects/:projectId/snapshots', async (req, res) => {
  try {
    const { projectId } = req.params;
    const snapshotData = {
      ...req.body,
      projectId,
    };

    const snapshot = await versionModel.createSnapshot(snapshotData);
    res.json({ success: true, snapshot });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== RELEASE ROUTES ==============

/**
 * GET /api/versions/projects/:projectId/releases
 * Get all releases for a project
 */
router.get('/projects/:projectId/releases', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, environment } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (environment) filters.environment = environment;

    const releases = await versionModel.getReleases(projectId, filters);
    res.json({ success: true, releases });
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/releases/:releaseId
 * Get a specific release
 */
router.get('/releases/:releaseId', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const release = await versionModel.getReleaseById(releaseId);
    
    if (!release) {
      return res.status(404).json({ success: false, error: 'Release not found' });
    }

    res.json({ success: true, release });
  } catch (error) {
    console.error('Error fetching release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/projects/:projectId/releases
 * Create a new release
 */
router.post('/projects/:projectId/releases', async (req, res) => {
  try {
    const { projectId } = req.params;
    const releaseData = {
      ...req.body,
      projectId,
    };

    const release = await versionModel.createRelease(releaseData);
    res.json({ success: true, release });
  } catch (error) {
    console.error('Error creating release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/releases/:releaseId/promote
 * Promote a release to a new environment
 */
router.post('/releases/:releaseId/promote', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const { targetEnvironment, promotedBy } = req.body;

    const result = await versionModel.promoteRelease(releaseId, targetEnvironment, promotedBy);
    res.json(result);
  } catch (error) {
    console.error('Error promoting release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/releases/:releaseId/sign
 * Sign a release
 */
router.post('/releases/:releaseId/sign', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const { signedBy } = req.body;

    const result = await versionModel.signRelease(releaseId, signedBy);
    res.json(result);
  } catch (error) {
    console.error('Error signing release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/projects/:projectId/stats
 * Get all releases for a project
 */
router.get('/projects/:projectId/releases', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, environment } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (environment) filters.environment = environment;

    const releases = await versionModel.getReleases(projectId, filters);
    res.json({ success: true, releases });
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/releases/:releaseId
 * Get a specific release
 */
router.get('/releases/:releaseId', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const release = await versionModel.getReleaseById(releaseId);

    if (!release) {
      return res.status(404).json({ success: false, error: 'Release not found' });
    }

    res.json({ success: true, release });
  } catch (error) {
    console.error('Error fetching release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/projects/:projectId/releases
 * Create a release
 */
router.post('/projects/:projectId/releases', async (req, res) => {
  try {
    const { projectId } = req.params;
    const releaseData = {
      ...req.body,
      projectId,
    };

    const release = await versionModel.createRelease(releaseData);
    res.json({ success: true, release });
  } catch (error) {
    console.error('Error creating release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/releases/:releaseId/promote
 * Promote a release for deployment
 */
router.post('/releases/:releaseId/promote', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const { targetEnvironment, promotedBy } = req.body;

    if (!targetEnvironment || !promotedBy) {
      return res.status(400).json({
        success: false,
        error: 'targetEnvironment and promotedBy are required',
      });
    }

    const result = await versionModel.promoteRelease(
      releaseId,
      targetEnvironment,
      promotedBy
    );
    res.json(result);
  } catch (error) {
    console.error('Error promoting release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== UTILITY ROUTES ==============

/**
 * GET /api/versions/projects/:projectId/history
 * Get version history for a project (combined view)
 */
router.get('/projects/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 50 } = req.query;

    const versions = await versionModel.getVersions(projectId, {
      limit: parseInt(limit),
    });
    const snapshots = await versionModel.getSnapshots(projectId);
    const releases = await versionModel.getReleases(projectId);

    res.json({
      success: true,
      history: {
        versions,
        snapshots,
        releases,
      },
    });
  } catch (error) {
    console.error('Error fetching project history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== RELEASE ROUTES ==============

/**
 * GET /api/versions/projects/:projectId/releases
 * Get all releases for a project
 */
router.get('/projects/:projectId/releases', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, environment } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (environment) filters.environment = environment;

    const releases = await versionModel.getReleases(projectId, filters);
    res.json({ success: true, releases });
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/releases/:releaseId
 * Get a specific release
 */
router.get('/releases/:releaseId', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const release = await versionModel.getReleaseById(releaseId);
    
    if (!release) {
      return res.status(404).json({ success: false, error: 'Release not found' });
    }

    res.json({ success: true, release });
  } catch (error) {
    console.error('Error fetching release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/projects/:projectId/releases
 * Create a new release
 */
router.post('/projects/:projectId/releases', async (req, res) => {
  try {
    const { projectId } = req.params;
    const releaseData = {
      ...req.body,
      projectId,
    };

    const release = await versionModel.createRelease(releaseData);
    res.json({ success: true, release });
  } catch (error) {
    console.error('Error creating release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/versions/releases/:releaseId/promote
 * Promote a release to a new environment
 */
router.post('/releases/:releaseId/promote', async (req, res) => {
  try {
    const { releaseId } = req.params;
    const { targetEnvironment, promotedBy } = req.body;

    const result = await versionModel.promoteRelease(releaseId, targetEnvironment, promotedBy);
    res.json(result);
  } catch (error) {
    console.error('Error promoting release:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/versions/projects/:projectId/stats
 * Get versioning statistics for a project
 */
router.get('/projects/:projectId/stats', async (req, res) => {
  try {
    const { projectId } = req.params;

    const [
      versionCount,
      snapshotCount,
      releaseCount,
      branchCount,
    ] = await Promise.all([
      knex('versions').where({ project_id: projectId }).count('* as count'),
      knex('snapshots').where({ project_id: projectId }).count('* as count'),
      knex('releases').where({ project_id: projectId }).count('* as count'),
      knex('branches')
        .where({ project_id: projectId, is_active: true })
        .count('* as count'),
    ]);

    // Get total storage used
    const storageStats = await knex('versions')
      .where({ project_id: projectId })
      .sum('total_size_bytes as totalSize')
      .sum('compressed_size_bytes as compressedSize')
      .first();

    res.json({
      success: true,
      stats: {
        versions: versionCount[0].count,
        snapshots: snapshotCount[0].count,
        releases: releaseCount[0].count,
        branches: branchCount[0].count,
        totalStorageBytes: storageStats?.totalSize || 0,
        compressedStorageBytes: storageStats?.compressedSize || 0,
        compressionRatio:
          storageStats?.totalSize > 0
            ? storageStats.compressedSize / storageStats.totalSize
            : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching project stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
