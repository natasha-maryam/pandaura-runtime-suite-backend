/**
 * Diff Utility for Version Control
 * Generates file-wise and line-wise diffs between versions
 * Supports unified diff format similar to Git
 */
class DiffUtil {
  /**
   * Generate a unified diff between two strings (line-based)
   */
  generateUnifiedDiff(oldContent, newContent, options = {}) {
    const {
      contextLines = 3,
      oldFileName = 'old',
      newFileName = 'new',
    } = options;

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const lcs = this.longestCommonSubsequence(oldLines, newLines);
    const hunks = this.generateHunks(oldLines, newLines, lcs, contextLines);

    const diff = {
      oldFileName,
      newFileName,
      hunks,
      linesAdded: 0,
      linesDeleted: 0,
      linesModified: 0,
      isIdentical: hunks.length === 0,
    };

    // Calculate statistics
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') diff.linesAdded++;
        else if (line.type === 'delete') diff.linesDeleted++;
      }
    }

    // Estimate modified lines (pairs of add/delete)
    diff.linesModified = Math.min(diff.linesAdded, diff.linesDeleted);

    return diff;
  }

  /**
   * Generate hunks (sections of changes) for unified diff
   */
  generateHunks(oldLines, newLines, lcs, contextLines) {
    const hunks = [];
    const changes = this.calculateChanges(oldLines, newLines, lcs);

    if (changes.length === 0) {
      return hunks;
    }

    let currentHunk = null;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      if (!currentHunk) {
        // Start new hunk
        currentHunk = {
          oldStart: Math.max(1, change.oldLine - contextLines),
          oldLines: 0,
          newStart: Math.max(1, change.newLine - contextLines),
          newLines: 0,
          lines: [],
        };

        // Add context before
        const contextStart = Math.max(0, change.oldLine - contextLines - 1);
        const contextEnd = change.oldLine - 1;
        for (let j = contextStart; j < contextEnd; j++) {
          currentHunk.lines.push({
            type: 'context',
            content: oldLines[j],
            oldLine: j + 1,
            newLine: change.newLine - (change.oldLine - j - 1),
          });
          currentHunk.oldLines++;
          currentHunk.newLines++;
        }
      }

      // Add the change
      if (change.type === 'delete') {
        currentHunk.lines.push({
          type: 'delete',
          content: oldLines[change.oldLine - 1],
          oldLine: change.oldLine,
        });
        currentHunk.oldLines++;
      } else if (change.type === 'add') {
        currentHunk.lines.push({
          type: 'add',
          content: newLines[change.newLine - 1],
          newLine: change.newLine,
        });
        currentHunk.newLines++;
      }

      // Check if we should add context and close this hunk
      const isLastChange = i === changes.length - 1;
      const nextChange = !isLastChange ? changes[i + 1] : null;
      const shouldCloseHunk =
        isLastChange ||
        (nextChange &&
          (nextChange.oldLine - change.oldLine > contextLines * 2 + 1 ||
            nextChange.newLine - change.newLine > contextLines * 2 + 1));

      if (shouldCloseHunk) {
        // Add context after
        const contextStart = change.oldLine;
        const contextEnd = Math.min(oldLines.length, change.oldLine + contextLines);
        for (let j = contextStart; j < contextEnd; j++) {
          currentHunk.lines.push({
            type: 'context',
            content: oldLines[j],
            oldLine: j + 1,
            newLine: change.newLine + (j - change.oldLine + 1),
          });
          currentHunk.oldLines++;
          currentHunk.newLines++;
        }

        hunks.push(currentHunk);
        currentHunk = null;
      }
    }

    return hunks;
  }

  /**
   * Calculate changes between old and new lines using LCS
   */
  calculateChanges(oldLines, newLines, lcs) {
    const changes = [];
    let oldIndex = 0;
    let newIndex = 0;
    let lcsIndex = 0;

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (
        lcsIndex < lcs.length &&
        oldIndex < oldLines.length &&
        newIndex < newLines.length &&
        oldLines[oldIndex] === lcs[lcsIndex] &&
        newLines[newIndex] === lcs[lcsIndex]
      ) {
        // Lines match (part of LCS)
        oldIndex++;
        newIndex++;
        lcsIndex++;
      } else if (
        lcsIndex >= lcs.length ||
        (newIndex < newLines.length &&
          (oldIndex >= oldLines.length ||
            newLines[newIndex] !== lcs[lcsIndex]))
      ) {
        // Line added
        changes.push({
          type: 'add',
          oldLine: oldIndex + 1,
          newLine: newIndex + 1,
        });
        newIndex++;
      } else {
        // Line deleted
        changes.push({
          type: 'delete',
          oldLine: oldIndex + 1,
          newLine: newIndex + 1,
        });
        oldIndex++;
      }
    }

    return changes;
  }

  /**
   * Longest Common Subsequence algorithm (optimized)
   */
  longestCommonSubsequence(arr1, arr2) {
    const m = arr1.length;
    const n = arr2.length;

    // Create a 2D array for memoization
    const dp = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    // Build LCS length table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Reconstruct LCS
    const lcs = [];
    let i = m;
    let j = n;

    while (i > 0 && j > 0) {
      if (arr1[i - 1] === arr2[j - 1]) {
        lcs.unshift(arr1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Format unified diff as text (similar to Git diff output)
   */
  formatUnifiedDiff(diff) {
    let output = `--- ${diff.oldFileName}\n`;
    output += `+++ ${diff.newFileName}\n`;

    for (const hunk of diff.hunks) {
      output += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;

      for (const line of hunk.lines) {
        if (line.type === 'context') {
          output += ` ${line.content}\n`;
        } else if (line.type === 'add') {
          output += `+${line.content}\n`;
        } else if (line.type === 'delete') {
          output += `-${line.content}\n`;
        }
      }
    }

    return output;
  }

  /**
   * Compare multiple files between versions
   */
  compareFiles(oldFiles, newFiles) {
    try {
      console.log('🔍 DiffUtil.compareFiles called');
      console.log(`  Old files count: ${oldFiles ? oldFiles.length : 'null/undefined'}`);
      console.log(`  New files count: ${newFiles ? newFiles.length : 'null/undefined'}`);
      
      if (!oldFiles || !Array.isArray(oldFiles)) {
        throw new Error('oldFiles must be an array');
      }
      if (!newFiles || !Array.isArray(newFiles)) {
        throw new Error('newFiles must be an array');
      }
      
      const fileChanges = [];
      const oldFileMap = new Map(oldFiles.map((f) => [f.path, f]));
      const newFileMap = new Map(newFiles.map((f) => [f.path, f]));

      console.log(`  Old file paths: ${Array.from(oldFileMap.keys()).join(', ')}`);
      console.log(`  New file paths: ${Array.from(newFileMap.keys()).join(', ')}`);

      // Check for added and modified files
      for (const [path, newFile] of newFileMap) {
        try {
          // Skip tags.json files and other metadata files
          if (path.endsWith('tags.json') || 
              path.includes('tags/tags.json') ||
              path.endsWith('.tags.json') ||
              path.includes('/tags.json')) {
            console.log(`  ⏭️  Skipping metadata file: ${path}`);
            continue;
          }

          const oldFile = oldFileMap.get(path);

          if (!oldFile) {
            // File added
            console.log(`  ➕ File added: ${path}`);
            fileChanges.push({
              path,
              type: 'added',
              linesAdded: newFile.content ? newFile.content.split('\n').length : 0,
              linesDeleted: 0,
              diff: this.generateUnifiedDiff('', newFile.content || '', {
                oldFileName: '/dev/null',
                newFileName: path,
                contextLines: 0,
              }),
            });
          } else if (oldFile.content !== newFile.content) {
            // File modified
            console.log(`  📝 File modified: ${path}`);
            const diff = this.generateUnifiedDiff(oldFile.content || '', newFile.content || '', {
              oldFileName: path,
              newFileName: path,
            });

            fileChanges.push({
              path,
              type: 'modified',
              linesAdded: diff.linesAdded,
              linesDeleted: diff.linesDeleted,
              diff,
            });
          }
        } catch (fileError) {
          console.error(`❌ Error processing file ${path}:`, fileError.message);
          // Skip this file on error
        }
      }

      // Check for deleted files
      for (const [path, oldFile] of oldFileMap) {
        try {
          // Skip tags.json files and other metadata files
          if (path.endsWith('tags.json') || 
              path.includes('tags/tags.json') ||
              path.endsWith('.tags.json') ||
              path.includes('/tags.json')) {
            console.log(`  ⏭️  Skipping metadata file: ${path}`);
            continue;
          }

          if (!newFileMap.has(path)) {
            console.log(`  ➖ File deleted: ${path}`);
            fileChanges.push({
              path,
              type: 'deleted',
              linesAdded: 0,
              linesDeleted: oldFile.content ? oldFile.content.split('\n').length : 0,
              diff: this.generateUnifiedDiff(oldFile.content || '', '', {
                oldFileName: path,
                newFileName: '/dev/null',
                contextLines: 0,
              }),
            });
          }
        } catch (fileError) {
          console.error(`❌ Error processing deleted file ${path}:`, fileError.message);
          // Skip this file on error
        }
      }

      // Calculate summary
      const summary = {
        filesChanged: fileChanges.length,
        filesAdded: fileChanges.filter((f) => f.type === 'added').length,
        filesModified: fileChanges.filter((f) => f.type === 'modified').length,
        filesDeleted: fileChanges.filter((f) => f.type === 'deleted').length,
        totalLinesAdded: fileChanges.reduce((sum, f) => sum + f.linesAdded, 0),
        totalLinesDeleted: fileChanges.reduce((sum, f) => sum + f.linesDeleted, 0),
      };

      console.log('✅ DiffUtil.compareFiles completed:', summary);

      return {
        fileChanges,
        summary,
      };
    } catch (error) {
      console.error('❌ ERROR in DiffUtil.compareFiles:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Generate a truncated diff preview (first N lines)
   */
  generateDiffPreview(diff, maxLines = 20) {
    const formattedDiff = this.formatUnifiedDiff(diff);
    const lines = formattedDiff.split('\n');

    if (lines.length <= maxLines) {
      return formattedDiff;
    }

    return lines.slice(0, maxLines).join('\n') + '\n... (truncated)';
  }

  /**
   * Calculate similarity percentage between two files
   */
  calculateSimilarity(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const lcs = this.longestCommonSubsequence(oldLines, newLines);
    const maxLines = Math.max(oldLines.length, newLines.length);

    if (maxLines === 0) return 100;

    return (lcs.length / maxLines) * 100;
  }

  /**
   * Detect if file was moved/renamed based on content similarity
   */
  detectMovedFiles(oldFiles, newFiles, similarityThreshold = 80) {
    const moved = [];
    const oldFileMap = new Map(oldFiles.map((f) => [f.path, f]));
    const newFileMap = new Map(newFiles.map((f) => [f.path, f]));

    // Find deleted files
    const deletedFiles = oldFiles.filter((f) => !newFileMap.has(f.path));
    const addedFiles = newFiles.filter((f) => !oldFileMap.has(f.path));

    // Compare deleted and added files for similarity
    for (const deletedFile of deletedFiles) {
      for (const addedFile of addedFiles) {
        const similarity = this.calculateSimilarity(
          deletedFile.content,
          addedFile.content
        );

        if (similarity >= similarityThreshold) {
          moved.push({
            oldPath: deletedFile.path,
            newPath: addedFile.path,
            similarity,
          });
          break;
        }
      }
    }

    return moved;
  }
}

module.exports = new DiffUtil();
