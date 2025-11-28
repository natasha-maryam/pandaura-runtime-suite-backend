const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const FileStorageUtil = require('../utils/fileStorage');
const diffUtil = require('../utils/diffUtil');

/**
 * Version Model
 * Handles version control operations including branches, versions, snapshots, and releases
 */
class VersionModel {
  constructor(db) {
    this.db = db;
    this.storage = new FileStorageUtil();
  }

  // ============== BRANCH OPERATIONS ==============

  /**
   * Get all branches for a project
   */
  async getBranches(projectId) {
    const branches = await this.db('branches')
      .where({ project_id: projectId, is_active: true })
      .orderBy('created_at', 'desc');

    return branches.map(this.formatBranch);
  }

  /**
   * Get a single branch by ID
   */
  async getBranchById(branchId) {
    const branch = await this.db('branches')
      .where({ id: branchId })
      .first();

    return branch ? this.formatBranch(branch) : null;
  }

  /**
   * Create a new branch
   */
  async createBranch(branchData) {
    const branchId = uuidv4();

    await this.db('branches').insert({
      id: branchId,
      project_id: branchData.projectId,
      name: branchData.name,
      stage: branchData.stage || 'dev',
      parent_branch_id: branchData.parentBranchId || null,
      is_default: branchData.isDefault || false,
      created_by: branchData.createdBy,
      description: branchData.description,
      created_at: new Date().toISOString(),
      is_active: true,
    });

    return await this.getBranchById(branchId);
  }

  /**
   * Delete/deactivate a branch
   */
  async deleteBranch(branchId) {
    await this.db('branches')
      .where({ id: branchId })
      .update({ is_active: false });

    return { success: true };
  }

  // ============== VERSION OPERATIONS ==============

  /**
   * Get all versions for a project
   */
  async getVersions(projectId, filters = {}) {
    let query = this.db('versions')
      .where({ project_id: projectId })
      .orderBy('timestamp', 'desc');

    if (filters.branchId) {
      query = query.where({ branch_id: filters.branchId });
    }

    if (filters.status) {
      query = query.where({ status: filters.status });
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const versions = await query;
    return versions.map(this.formatVersion);
  }

  /**
   * Get a single version by ID with details
   */
  async getVersionById(versionId) {
    const version = await this.db('versions')
      .where({ id: versionId })
      .first();

    if (!version) {
      return null;
    }

    // Get associated files
    const files = await this.db('version_files')
      .where({ version_id: versionId })
      .select('*');

    // Get changelog entries
    const changelog = await this.db('version_changelog')
      .where({ version_id: versionId })
      .orderBy('timestamp', 'desc');

    return {
      ...this.formatVersion(version),
      files: files.map(this.formatVersionFile),
      changelog: changelog.map(this.formatChangelogEntry),
    };
  }

  /**
   * Create a new version (snapshot current state)
   */
  async createVersion(versionData) {
    const versionId = uuidv4();
    const { projectId, branchId, branch_id, author, message, files, tags } = versionData;
    
    // Validate required fields
    if (!projectId) {
      throw new Error('projectId is required');
    }
    if (!author) {
      throw new Error('author is required');
    }
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('At least one file is required');
    }
    
    // Accept both camelCase and snake_case
    const finalBranchId = branchId || branch_id;
    
    console.log('🔄 Creating version:', { projectId, finalBranchId, filesCount: files.length });

    try {
      // Auto-generate version number if not provided
      let version = versionData.version;
      if (!version) {
        // Get the latest version for this project/branch
        const latestVersion = await this.db('versions')
          .where({ project_id: projectId, branch_id: finalBranchId })
          .orderBy('timestamp', 'desc')
          .first();

        if (latestVersion && latestVersion.version) {
          // Increment version (e.g., v1.0.0 -> v1.0.1)
          const match = latestVersion.version.match(/v(\d+)\.(\d+)\.(\d+)/);
          if (match) {
            const [, major, minor, patch] = match;
            version = `v${major}.${minor}.${parseInt(patch) + 1}`;
          } else {
            // Fallback if version format doesn't match
            version = `v1.0.${Date.now()}`;
          }
        } else {
          // First version for this project/branch
          version = 'v1.0.0';
        }
      }
      
      console.log('📦 Generated version number:', version);

      // Store files and calculate checksums
      console.log('💾 Storing files to disk...');
      const storageResult = await this.storage.storeVersionSnapshot(
        projectId,
        versionId,
        files,
        { compress: true }
      );
      console.log('✅ Files stored successfully');

      // Calculate overall checksum
      console.log('🔐 Calculating checksums...');
      const checksumData = files
        .map((f) => f.path + f.content)
        .join('');
      const checksum = crypto
        .createHash('sha256')
        .update(checksumData)
        .digest('hex');
      console.log('✅ Checksum calculated');

      // Get parent version if this is not the first version
      console.log('🔍 Looking for parent version...');
      const parentVersion = await this.db('versions')
        .where({ project_id: projectId, branch_id: finalBranchId })
        .orderBy('timestamp', 'desc')
        .first();

      // Calculate diff statistics if parent exists
      let linesAdded = 0;
      let linesDeleted = 0;

      if (parentVersion) {
        try {
          console.log('📊 Calculating diff from parent...');
          console.log('Parent version ID:', parentVersion.id);
          console.log('Parent version number:', parentVersion.version);
          
          console.log('🔄 Retrieving parent version files...');
          const parentFiles = await this.getVersionFiles(parentVersion.id);
          console.log(`✅ Retrieved ${parentFiles.length} parent files`);
          
          if (parentFiles.length === 0) {
            console.warn('⚠️ No parent files found, skipping diff calculation');
          } else {
            console.log('🔍 Parent files:', parentFiles.map(f => ({ 
              path: f.file_path || f.filePath, 
              hasContent: !!f.content,
              contentLength: f.content ? f.content.length : 0
            })));
            
            console.log('🔍 Current files:', files.map(f => ({ 
              path: f.path, 
              hasContent: !!f.content,
              contentLength: f.content ? f.content.length : 0
            })));
            
            console.log('📐 Calling diffUtil.compareFiles...');
            const diffResult = diffUtil.compareFiles(
              parentFiles.map((f) => ({ path: f.file_path || f.filePath, content: f.content })),
              files.map((f) => ({ path: f.path, content: f.content }))
            );
            
            console.log('✅ Diff calculation complete:', diffResult.summary);
            linesAdded = diffResult.summary.totalLinesAdded;
            linesDeleted = diffResult.summary.totalLinesDeleted;
          }
        } catch (diffError) {
          console.error('❌ ERROR during diff calculation:', diffError);
          console.error('Error stack:', diffError.stack);
          console.error('Error message:', diffError.message);
          console.error('Error name:', diffError.name);
          
          // Continue with version creation even if diff fails
          console.warn('⚠️ Continuing version creation without diff statistics');
          linesAdded = 0;
          linesDeleted = 0;
        }
      }

      // Insert version record
      console.log('💾 Inserting version record to database...');
      await this.db('versions').insert({
        id: versionId,
        project_id: projectId,
        branch_id: finalBranchId,
        version,
        author,
        message,
        timestamp: new Date().toISOString(),
        status: 'draft',
        checksum,
        files_changed: storageResult.files.length,
        lines_added: linesAdded,
        lines_deleted: linesDeleted,
        parent_version_id: parentVersion ? parentVersion.id : null,
        tags_json: tags ? JSON.stringify(tags) : null,
        total_size_bytes: storageResult.totalOriginalSize,
        compressed_size_bytes: storageResult.totalStoredSize,
        approvals: 0,
        approvals_required: 3,
        signed: false,
      });
      console.log('✅ Version record inserted');

      // Insert version files
      console.log('📁 Inserting version files records...');
      for (const fileResult of storageResult.files) {
        const fileId = uuidv4();
        const file = files.find((f) => f.path === fileResult.filePath);

        // Determine change type
        let changeType = 'modified';
        if (parentVersion) {
          const parentFile = await this.db('version_files')
            .where({
              version_id: parentVersion.id,
              file_path: fileResult.filePath,
            })
            .first();

          if (!parentFile) {
            changeType = 'added';
          }
        } else {
          changeType = 'added';
        }

        // Generate diff preview
        let diffPreview = '';
        if (parentVersion && changeType === 'modified') {
          const parentFile = await this.getVersionFileContent(
            parentVersion.id,
            fileResult.filePath
          );
          if (parentFile) {
            const diff = diffUtil.generateUnifiedDiff(
              parentFile.content,
              file.content,
              {
                oldFileName: fileResult.filePath,
                newFileName: fileResult.filePath,
              }
            );
            diffPreview = diffUtil.generateDiffPreview(diff, 50);
          }
        }

        await this.db('version_files').insert({
          id: fileId,
          version_id: versionId,
          file_path: fileResult.filePath,
          file_type: file.type || 'logic',
          change_type: changeType,
          lines_added: 0, // Will be calculated from diff
          lines_deleted: 0,
          file_size_bytes: fileResult.originalSize,
          file_checksum: fileResult.checksum,
          storage_path: fileResult.storagePath,
          is_compressed: fileResult.isCompressed,
          is_delta: fileResult.isDelta,
          diff_preview: diffPreview,
          created_at: new Date().toISOString(),
        });
      }
      console.log('✅ Version files records inserted');

      // Create changelog entry
      console.log('📝 Creating changelog entry...');
      await this.createChangelogEntry(versionId, 'created', author, {
        message: 'Version created',
      });
      console.log('✅ Changelog entry created');

      console.log('🔍 Fetching complete version data...');
      const result = await this.getVersionById(versionId);
      console.log('✅ Version creation complete!');
      return result;
    } catch (error) {
      console.error('❌ Error creating version:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Get version file content
   */
  async getVersionFileContent(versionId, filePath) {
    const file = await this.db('version_files')
      .where({ version_id: versionId, file_path: filePath })
      .first();

    if (!file) {
      return null;
    }

    try {
      const content = await this.storage.retrieveFile(file.storage_path, {
        isCompressed: file.is_compressed,
        isDelta: file.is_delta,
      });

      return {
        ...this.formatVersionFile(file),
        content,
      };
    } catch (error) {
      console.error('Error retrieving file content:', error);
      return null;
    }
  }

  /**
   * Get all files for a version
   */
  async getVersionFiles(versionId) {
    try {
      const files = await this.db('version_files')
        .where({ version_id: versionId })
        .select('*');

      console.log(`📂 Found ${files.length} file records for version ${versionId}`);

      // Load content for each file
      const filesWithContent = await Promise.all(
        files.map(async (file) => {
          try {
            console.log(`📄 Retrieving content for: ${file.file_path} from ${file.storage_path}`);
            const content = await this.storage.retrieveFile(file.storage_path, {
              isCompressed: file.is_compressed,
              isDelta: file.is_delta,
            });
            console.log(`✅ Retrieved ${content ? content.length : 0} bytes for ${file.file_path}`);
            return {
              ...this.formatVersionFile(file),
              content,
            };
          } catch (fileError) {
            console.error(`❌ Error retrieving file ${file.file_path}:`, fileError.message);
            // Return file metadata with empty content on error
            return {
              ...this.formatVersionFile(file),
              content: '',
            };
          }
        })
      );

      return filesWithContent;
    } catch (error) {
      console.error('❌ ERROR in getVersionFiles:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Compare two versions (generate diff)
   */
  async compareVersions(versionId1, versionId2) {
    try {
      console.log('📂 Getting files for version 1:', versionId1);
      const version1Files = await this.getVersionFiles(versionId1);
      console.log(`✅ Got ${version1Files.length} files for version 1`);
      
      console.log('📂 Getting files for version 2:', versionId2);
      const version2Files = await this.getVersionFiles(versionId2);
      console.log(`✅ Got ${version2Files.length} files for version 2`);

      console.log('🔍 Calling diffUtil.compareFiles...');
      const comparison = diffUtil.compareFiles(
        version1Files.map((f) => ({ path: f.filePath, content: f.content })),
        version2Files.map((f) => ({ path: f.filePath, content: f.content }))
      );
      
      console.log('✅ Comparison complete:', {
        fileChanges: comparison.fileChanges?.length || 0,
        summary: comparison.summary
      });

      return comparison;
    } catch (error) {
      console.error('❌ ERROR in compareVersions:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Update version status
   */
  async updateVersionStatus(versionId, status, actor) {
    await this.db('versions')
      .where({ id: versionId })
      .update({ status });

    await this.createChangelogEntry(versionId, 'status_changed', actor, {
      newStatus: status,
    });

    return await this.getVersionById(versionId);
  }

  /**
   * Sign a version
   */
  async signVersion(versionId, signedBy) {
    const version = await this.db('versions')
      .where({ id: versionId })
      .first();

    if (!version) {
      throw new Error('Version not found');
    }

    // Generate signature (simplified - in production use proper crypto)
    const signatureData = `${version.id}:${version.checksum}:${signedBy}:${new Date().toISOString()}`;
    const signature = crypto
      .createHash('sha256')
      .update(signatureData)
      .digest('hex');

    await this.db('versions')
      .where({ id: versionId })
      .update({
        signed: true,
        signature,
        signed_by: signedBy,
        signed_at: new Date().toISOString(),
      });

    await this.createChangelogEntry(versionId, 'signed', signedBy, {
      signature,
    });

    return await this.getVersionById(versionId);
  }

  /**
   * Approve a version
   */
  async approveVersion(versionId, approver) {
    const version = await this.db('versions')
      .where({ id: versionId })
      .first();

    if (!version) {
      throw new Error('Version not found');
    }

    const approvers = version.approvers_json
      ? JSON.parse(version.approvers_json)
      : [];

    // Check if already approved by this user
    if (approvers.some((a) => a.name === approver)) {
      throw new Error('Already approved by this user');
    }

    approvers.push({
      name: approver,
      timestamp: new Date().toISOString(),
    });

    const newApprovalCount = version.approvals + 1;

    await this.db('versions')
      .where({ id: versionId })
      .update({
        approvals: newApprovalCount,
        approvers_json: JSON.stringify(approvers),
      });

    await this.createChangelogEntry(versionId, 'approved', approver, {
      approvalCount: newApprovalCount,
      approvalsRequired: version.approvals_required,
    });

    return await this.getVersionById(versionId);
  }

  // ============== SNAPSHOT OPERATIONS ==============

  /**
   * Get all snapshots for a project
   */
  async getSnapshots(projectId) {
    const snapshots = await this.db('snapshots')
      .where({ project_id: projectId })
      .orderBy('created_at', 'desc');

    return snapshots.map(this.formatSnapshot);
  }

  /**
   * Create a snapshot
   */
  async createSnapshot(snapshotData) {
    const snapshotId = uuidv4();

    await this.db('snapshots').insert({
      id: snapshotId,
      project_id: snapshotData.projectId,
      version_id: snapshotData.versionId,
      name: snapshotData.name,
      description: snapshotData.description,
      created_by: snapshotData.createdBy,
      created_at: new Date().toISOString(),
      tags_json: snapshotData.tags ? JSON.stringify(snapshotData.tags) : null,
      metadata_json: snapshotData.metadata
        ? JSON.stringify(snapshotData.metadata)
        : null,
    });

    return await this.getSnapshotById(snapshotId);
  }

  /**
   * Get snapshot by ID
   */
  async getSnapshotById(snapshotId) {
    const snapshot = await this.db('snapshots')
      .where({ id: snapshotId })
      .first();

    if (!snapshot) {
      return null;
    }

    // Get associated version
    const version = await this.getVersionById(snapshot.version_id);

    return {
      ...this.formatSnapshot(snapshot),
      version,
    };
  }

  // ============== RELEASE OPERATIONS ==============

  /**
   * Get all releases for a project
   */
  async getReleases(projectId, filters = {}) {
    let query = this.db('releases')
      .where({ project_id: projectId })
      .orderBy('created_at', 'desc');

    if (filters.status) {
      query = query.where({ status: filters.status });
    }

    if (filters.environment) {
      query = query.where({ environment: filters.environment });
    }

    const releases = await query;
    return releases.map(this.formatRelease);
  }

  /**
   * Create a release
   */
  async createRelease(releaseData) {
    const releaseId = uuidv4();
    const {
      projectId,
      snapshotId,
      versionId,
      name,
      version,
      description,
      createdBy,
      tags,
      metadata,
    } = releaseData;

    try {
      // Create release bundle
      const bundleResult = await this.storage.createReleaseBundle(
        projectId,
        releaseId,
        versionId
      );

      // Generate signature
      const signatureData = `${releaseId}:${bundleResult.bundleChecksum}:${createdBy}:${new Date().toISOString()}`;
      const signature = crypto
        .createHash('sha256')
        .update(signatureData)
        .digest('hex');

      await this.db('releases').insert({
        id: releaseId,
        project_id: projectId,
        snapshot_id: snapshotId,
        version_id: versionId,
        name,
        version,
        description,
        created_by: createdBy,
        created_at: new Date().toISOString(),
        signed: true,
        signature,
        signed_by: createdBy,
        signed_at: new Date().toISOString(),
        status: 'active',
        environment: releaseData.stage || 'main', // Default to main stage
        tags_json: tags ? JSON.stringify(tags) : null,
        metadata_json: metadata ? JSON.stringify(metadata) : null,
        bundle_path: bundleResult.bundlePath,
        bundle_size_bytes: bundleResult.bundleSize,
        bundle_checksum: bundleResult.bundleChecksum,
        linked_deploys: 0,
      });

      // Update version status to released
      await this.updateVersionStatus(versionId, 'released', createdBy);

      return await this.getReleaseById(releaseId);
    } catch (error) {
      console.error('Error creating release:', error);
      throw error;
    }
  }

  /**
   * Get release by ID
   */
  async getReleaseById(releaseId) {
    const release = await this.db('releases')
      .where({ id: releaseId })
      .first();

    if (!release) {
      return null;
    }

    // Get associated snapshot and version
    const snapshot = await this.getSnapshotById(release.snapshot_id);

    return {
      ...this.formatRelease(release),
      snapshot,
    };
  }

  /**
   * Promote a release (queue for deployment)
   */
  async promoteRelease(releaseId, targetEnvironment, promotedBy) {
    const release = await this.db('releases')
      .where({ id: releaseId })
      .first();

    if (!release) {
      throw new Error('Release not found');
    }

    // Update last deployed timestamp
    await this.db('releases')
      .where({ id: releaseId })
      .update({
        last_deployed_at: new Date().toISOString(),
        linked_deploys: release.linked_deploys + 1,
      });

    // Create a promotion record (you may want to add a deployments table)
    const metadata = release.metadata_json
      ? JSON.parse(release.metadata_json)
      : {};

    metadata.promotions = metadata.promotions || [];
    metadata.promotions.push({
      targetEnvironment,
      promotedBy,
      timestamp: new Date().toISOString(),
    });

    await this.db('releases')
      .where({ id: releaseId })
      .update({
        metadata_json: JSON.stringify(metadata),
      });

    return {
      success: true,
      release: await this.getReleaseById(releaseId),
      deployment: {
        releaseId,
        targetEnvironment,
        promotedBy,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Sign a release
   */
  async signRelease(releaseId, signedBy) {
    const release = await this.db('releases')
      .where({ id: releaseId })
      .first();

    if (!release) {
      throw new Error('Release not found');
    }

    if (release.signed) {
      throw new Error('Release is already signed');
    }

    // Update release with signature information
    await this.db('releases')
      .where({ id: releaseId })
      .update({
        signed: true,
        signed_by: signedBy,
        signed_at: new Date().toISOString(),
      });

    return {
      success: true,
      release: await this.getReleaseById(releaseId),
    };
  }

  // ============== CHANGELOG OPERATIONS ==============

  /**
   * Create changelog entry
   */
  async createChangelogEntry(versionId, action, actor, details = {}) {
    const entryId = uuidv4();

    await this.db('version_changelog').insert({
      id: entryId,
      version_id: versionId,
      action,
      actor,
      timestamp: new Date().toISOString(),
      details_json: JSON.stringify(details),
    });

    return { success: true };
  }

  // ============== RELEASE OPERATIONS ==============

  /**
   * Get all releases for a project
   */
  async getReleases(projectId, filters = {}) {
    let query = this.db('releases')
      .where({ project_id: projectId })
      .orderBy('created_at', 'desc');

    if (filters.status) {
      query = query.where('status', filters.status);
    }
    if (filters.environment) {
      query = query.where('environment', filters.environment);
    }

    const releases = await query;
    return releases.map(release => this.formatRelease(release));
  }

  /**
   * Get a single release by ID
   */
  async getReleaseById(releaseId) {
    const release = await this.db('releases')
      .where({ id: releaseId })
      .first();

    return release ? this.formatRelease(release) : null;
  }

  /**
   * Create a new release
   */
  async createRelease(releaseData) {
    const releaseId = uuidv4();

    try {
      await this.db('releases').insert({
        id: releaseId,
        project_id: releaseData.projectId,
        snapshot_id: releaseData.snapshotId,
        version_id: releaseData.versionId,
        name: releaseData.name,
        version: releaseData.version,
        description: releaseData.description,
        environment: releaseData.stage || 'main',
        created_by: releaseData.createdBy,
        created_at: new Date().toISOString(),
        signed: false,
        status: 'active',
        tags_json: JSON.stringify(releaseData.tags || []),
        metadata_json: JSON.stringify(releaseData.metadata || {}),
      });

      return await this.getReleaseById(releaseId);
    } catch (error) {
      console.error('Error creating release:', error);
      throw new Error(`Failed to create release: ${error.message}`);
    }
  }

  /**
   * Promote a release to a new stage
   */
  async promoteRelease(releaseId, targetEnvironment, promotedBy) {
    try {
      // Update the release stage
      await this.db('releases')
        .where({ id: releaseId })
        .update({
          environment: targetEnvironment,
          last_deployed_at: new Date().toISOString(),
          deployed_by: promotedBy,
        });

      return { success: true, message: `Release promoted to ${targetEnvironment}` };
    } catch (error) {
      console.error('Error promoting release:', error);
      throw new Error(`Failed to promote release: ${error.message}`);
    }
  }

  // ============== FORMATTING HELPERS ==============

  formatBranch(branch) {
    return {
      id: branch.id,
      projectId: branch.project_id,
      name: branch.name,
      stage: branch.stage,
      parentBranchId: branch.parent_branch_id,
      isDefault: branch.is_default,
      createdBy: branch.created_by,
      createdAt: branch.created_at,
      description: branch.description,
      isActive: branch.is_active,
    };
  }

  formatVersion(version) {
    return {
      id: version.id,
      projectId: version.project_id,
      branchId: version.branch_id,
      version: version.version,
      author: version.author,
      timestamp: version.timestamp,
      message: version.message,
      status: version.status,
      checksum: version.checksum,
      filesChanged: version.files_changed,
      linesAdded: version.lines_added,
      linesDeleted: version.lines_deleted,
      parentVersionId: version.parent_version_id,
      tags: version.tags_json ? JSON.parse(version.tags_json) : [],
      metadata: version.metadata_json ? JSON.parse(version.metadata_json) : {},
      approvals: version.approvals,
      approvalsRequired: version.approvals_required,
      approvers: version.approvers_json
        ? JSON.parse(version.approvers_json)
        : [],
      signed: version.signed,
      signature: version.signature,
      signedBy: version.signed_by,
      signedAt: version.signed_at,
      totalSizeBytes: version.total_size_bytes,
      compressedSizeBytes: version.compressed_size_bytes,
    };
  }

  formatVersionFile(file) {
    return {
      id: file.id,
      versionId: file.version_id,
      filePath: file.file_path,
      fileType: file.file_type,
      changeType: file.change_type,
      linesAdded: file.lines_added,
      linesDeleted: file.lines_deleted,
      fileSizeBytes: file.file_size_bytes,
      fileChecksum: file.file_checksum,
      storagePath: file.storage_path,
      isCompressed: file.is_compressed,
      isDelta: file.is_delta,
      diffPreview: file.diff_preview,
      createdAt: file.created_at,
    };
  }

  formatSnapshot(snapshot) {
    return {
      id: snapshot.id,
      projectId: snapshot.project_id,
      versionId: snapshot.version_id,
      name: snapshot.name,
      description: snapshot.description,
      createdBy: snapshot.created_by,
      createdAt: snapshot.created_at,
      tags: snapshot.tags_json ? JSON.parse(snapshot.tags_json) : [],
      metadata: snapshot.metadata_json
        ? JSON.parse(snapshot.metadata_json)
        : {},
    };
  }

  formatRelease(release) {
    return {
      id: release.id,
      projectId: release.project_id,
      snapshotId: release.snapshot_id,
      versionId: release.version_id,
      name: release.name,
      version: release.version,
      description: release.description,
      createdBy: release.created_by,
      createdAt: release.created_at,
      signed: release.signed,
      signature: release.signature,
      signedBy: release.signed_by,
      signedAt: release.signed_at,
      status: release.status,
      stage: release.environment || 'main', // Map environment to stage
      tags: release.tags_json ? JSON.parse(release.tags_json) : [],
      metadata: release.metadata_json ? JSON.parse(release.metadata_json) : {},
      bundlePath: release.bundle_path,
      bundleSizeBytes: release.bundle_size_bytes,
      bundleChecksum: release.bundle_checksum,
      linkedDeploys: release.linked_deploys,
      lastDeployedAt: release.last_deployed_at,
    };
  }

  formatChangelogEntry(entry) {
    return {
      id: entry.id,
      versionId: entry.version_id,
      action: entry.action,
      actor: entry.actor,
      timestamp: entry.timestamp,
      details: entry.details_json ? JSON.parse(entry.details_json) : {},
    };
  }
}

module.exports = VersionModel;
