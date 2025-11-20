const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const brotli = promisify(zlib.brotliCompress);
const unbrotli = promisify(zlib.brotliDecompress);

/**
 * File Storage Utility for Version Control
 * Handles efficient storage, compression, and delta compression for multi-GB projects
 */
class FileStorageUtil {
  constructor(baseStoragePath) {
    this.baseStoragePath = baseStoragePath || path.join(process.cwd(), 'data', 'versions');
  }

  /**
   * Calculate SHA-256 checksum for content
   */
  calculateChecksum(content) {
    return crypto
      .createHash('sha256')
      .update(typeof content === 'string' ? content : JSON.stringify(content))
      .digest('hex');
  }

  /**
   * Compress content using Brotli (better compression than gzip)
   */
  async compress(content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compressed = await brotli(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 6, // Balance between speed and compression
      },
    });
    return compressed;
  }

  /**
   * Decompress Brotli compressed content
   */
  async decompress(compressedContent) {
    const buffer = Buffer.isBuffer(compressedContent) 
      ? compressedContent 
      : Buffer.from(compressedContent);
    const decompressed = await unbrotli(buffer);
    return decompressed.toString('utf-8');
  }

  /**
   * Store file content with optional compression
   * Returns storage metadata
   */
  async storeFile(projectId, versionId, filePath, content, options = {}) {
    const { compress = true, useDelta = false, baseContent = null } = options;

    // Calculate checksum
    const checksum = this.calculateChecksum(content);

    // Prepare storage directory
    const storageDir = path.join(this.baseStoragePath, projectId, versionId);
    await fs.mkdir(storageDir, { recursive: true });

    // Generate storage path
    const sanitizedPath = filePath.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = path.join(storageDir, sanitizedPath);

    let finalContent = content;
    let isDelta = false;
    let deltaBaseChecksum = null;
    let originalSize = Buffer.byteLength(content);
    let storedSize = originalSize;

    // Apply delta compression if requested and base content exists
    if (useDelta && baseContent) {
      const delta = this.createDelta(baseContent, content);
      if (delta.length < content.length * 0.7) { // Only use delta if < 70% of original
        finalContent = JSON.stringify(delta);
        isDelta = true;
        deltaBaseChecksum = this.calculateChecksum(baseContent);
        originalSize = Buffer.byteLength(content);
      }
    }

    // Compress if requested
    let isCompressed = false;
    if (compress) {
      const compressed = await this.compress(finalContent);
      if (compressed.length < Buffer.byteLength(finalContent)) {
        finalContent = compressed;
        isCompressed = true;
        storedSize = compressed.length;
      }
    }

    // Write to disk
    await fs.writeFile(storagePath, finalContent);

    return {
      storagePath,
      checksum,
      originalSize,
      storedSize,
      isCompressed,
      isDelta,
      deltaBaseChecksum,
      compressionRatio: originalSize > 0 ? storedSize / originalSize : 1,
    };
  }

  /**
   * Retrieve file content from storage
   */
  async retrieveFile(storagePath, options = {}) {
    const { isCompressed = false, isDelta = false, baseContent = null } = options;

    let content = await fs.readFile(storagePath);

    // Decompress if needed
    if (isCompressed) {
      content = await this.decompress(content);
    } else {
      content = content.toString('utf-8');
    }

    // Apply delta reconstruction if needed
    if (isDelta && baseContent) {
      const delta = JSON.parse(content);
      content = this.applyDelta(baseContent, delta);
    }

    return content;
  }

  /**
   * Create a simple delta (difference) between old and new content
   * Uses a line-based approach for text files
   */
  createDelta(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const delta = {
      type: 'line-delta',
      changes: [],
    };

    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        // Lines match, skip
        i++;
        j++;
      } else if (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
        // Line added or modified
        delta.changes.push({ type: 'add', line: j, content: newLines[j] });
        j++;
        // Check if this was a modification by looking ahead
        if (i < oldLines.length) {
          i++;
        }
      } else if (i < oldLines.length) {
        // Line deleted
        delta.changes.push({ type: 'delete', line: i });
        i++;
      }
    }

    return delta;
  }

  /**
   * Apply delta to reconstruct content
   */
  applyDelta(baseContent, delta) {
    if (delta.type !== 'line-delta') {
      throw new Error('Unsupported delta type');
    }

    const baseLines = baseContent.split('\n');
    const result = [...baseLines];

    // Apply changes in reverse order to maintain line numbers
    const sortedChanges = [...delta.changes].sort((a, b) => b.line - a.line);

    for (const change of sortedChanges) {
      if (change.type === 'add') {
        result.splice(change.line, 0, change.content);
      } else if (change.type === 'delete') {
        result.splice(change.line, 1);
      }
    }

    return result.join('\n');
  }

  /**
   * Store version snapshot (multiple files)
   */
  async storeVersionSnapshot(projectId, versionId, files, options = {}) {
    const results = [];
    const { compress = true } = options;

    for (const file of files) {
      const result = await this.storeFile(
        projectId,
        versionId,
        file.path,
        file.content,
        { compress, useDelta: false }
      );

      results.push({
        filePath: file.path,
        ...result,
      });
    }

    // Calculate total sizes
    const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalStoredSize = results.reduce((sum, r) => sum + r.storedSize, 0);

    return {
      files: results,
      totalOriginalSize,
      totalStoredSize,
      overallCompressionRatio: totalOriginalSize > 0 ? totalStoredSize / totalOriginalSize : 1,
    };
  }

  /**
   * Create a release bundle (tar-like structure)
   */
  async createReleaseBundle(projectId, releaseId, versionId) {
    const versionDir = path.join(this.baseStoragePath, projectId, versionId);
    const bundleDir = path.join(this.baseStoragePath, projectId, 'releases');
    await fs.mkdir(bundleDir, { recursive: true });

    const bundlePath = path.join(bundleDir, `${releaseId}.bundle`);

    // Read all files in version directory
    const files = await this.getAllFilesInDirectory(versionDir);

    // Create bundle metadata
    const bundle = {
      version: '1.0',
      projectId,
      versionId,
      releaseId,
      createdAt: new Date().toISOString(),
      files: [],
    };

    // Add each file to bundle
    for (const file of files) {
      const relativePath = path.relative(versionDir, file);
      const content = await fs.readFile(file);
      bundle.files.push({
        path: relativePath,
        content: content.toString('base64'),
        size: content.length,
      });
    }

    // Compress and write bundle
    const bundleContent = JSON.stringify(bundle);
    const compressed = await this.compress(bundleContent);
    await fs.writeFile(bundlePath, compressed);

    const bundleSize = compressed.length;
    const bundleChecksum = this.calculateChecksum(bundleContent);

    return {
      bundlePath,
      bundleSize,
      bundleChecksum,
      filesIncluded: bundle.files.length,
    };
  }

  /**
   * Extract release bundle
   */
  async extractReleaseBundle(bundlePath, targetDir) {
    const compressed = await fs.readFile(bundlePath);
    const content = await this.decompress(compressed);
    const bundle = JSON.parse(content);

    await fs.mkdir(targetDir, { recursive: true });

    const extractedFiles = [];

    for (const file of bundle.files) {
      const filePath = path.join(targetDir, file.path);
      const fileDir = path.dirname(filePath);
      await fs.mkdir(fileDir, { recursive: true });

      const content = Buffer.from(file.content, 'base64');
      await fs.writeFile(filePath, content);

      extractedFiles.push(filePath);
    }

    return {
      extractedFiles,
      bundle: {
        projectId: bundle.projectId,
        versionId: bundle.versionId,
        releaseId: bundle.releaseId,
        createdAt: bundle.createdAt,
      },
    };
  }

  /**
   * Get all files in directory recursively
   */
  async getAllFilesInDirectory(dir) {
    const files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...(await this.getAllFilesInDirectory(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Clean up old versions to save space
   */
  async cleanupOldVersions(projectId, keepCount = 50) {
    const projectDir = path.join(this.baseStoragePath, projectId);
    
    try {
      const versions = await fs.readdir(projectDir);
      
      if (versions.length <= keepCount) {
        return { cleaned: 0, message: 'No cleanup needed' };
      }

      // Sort by creation time and keep only the latest
      const versionStats = await Promise.all(
        versions.map(async (v) => {
          const stats = await fs.stat(path.join(projectDir, v));
          return { name: v, ctime: stats.ctime };
        })
      );

      versionStats.sort((a, b) => b.ctime - a.ctime);

      const toDelete = versionStats.slice(keepCount);
      let deletedCount = 0;

      for (const version of toDelete) {
        await fs.rm(path.join(projectDir, version.name), { recursive: true, force: true });
        deletedCount++;
      }

      return {
        cleaned: deletedCount,
        message: `Cleaned up ${deletedCount} old versions`,
      };
    } catch (error) {
      return { cleaned: 0, message: `Cleanup failed: ${error.message}` };
    }
  }
}

module.exports = FileStorageUtil;
