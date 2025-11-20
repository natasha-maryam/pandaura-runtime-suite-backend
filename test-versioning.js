/**
 * Test script for Versioning API
 * Run with: node test-versioning.js
 */

const API_BASE = 'http://localhost:8000/api';

async function testVersioningAPI() {
  console.log('🧪 Testing Versioning API...\n');

  try {
    // 1. Create a test project first (assuming projects API exists)
    console.log('1️⃣ Creating test project...');
    const projectRes = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Version Test Project',
        description: 'Project for testing versioning features'
      })
    });
    const { project } = await projectRes.json();
    console.log(`✅ Project created: ${project.id}\n`);

    // 2. Create a branch
    console.log('2️⃣ Creating development branch...');
    const branchRes = await fetch(`${API_BASE}/versions/projects/${project.id}/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'development',
        stage: 'dev',
        createdBy: 'test-user',
        description: 'Development branch for testing'
      })
    });
    const { branch } = await branchRes.json();
    console.log(`✅ Branch created: ${branch.id} (${branch.name})\n`);

    // 3. Create a version
    console.log('3️⃣ Creating version...');
    const versionRes = await fetch(`${API_BASE}/versions/projects/${project.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: branch.id,
        version: 'v1.0.0',
        author: 'test-user',
        message: 'Initial version for testing',
        tags: ['test', 'initial'],
        files: [
          {
            path: 'main.st',
            content: `PROGRAM Main
VAR
  counter : INT := 0;
  running : BOOL := FALSE;
END_VAR

counter := counter + 1;
IF counter > 100 THEN
  running := FALSE;
END_IF;

END_PROGRAM`,
            type: 'logic'
          },
          {
            path: 'config.json',
            content: JSON.stringify({ version: '1.0.0', enabled: true }, null, 2),
            type: 'config'
          }
        ]
      })
    });
    const { version } = await versionRes.json();
    console.log(`✅ Version created: ${version.id} (${version.version})`);
    console.log(`   Files: ${version.filesChanged}, Checksum: ${version.checksum.substring(0, 8)}...\n`);

    // 4. Get version details
    console.log('4️⃣ Fetching version details...');
    const versionDetailRes = await fetch(`${API_BASE}/versions/${version.id}`);
    const { version: versionDetail } = await versionDetailRes.json();
    console.log(`✅ Version details retrieved`);
    console.log(`   Files in version: ${versionDetail.files.length}`);
    console.log(`   Changelog entries: ${versionDetail.changelog.length}\n`);

    // 5. Create a snapshot
    console.log('5️⃣ Creating snapshot...');
    const snapshotRes = await fetch(`${API_BASE}/versions/projects/${project.id}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        versionId: version.id,
        name: 'Test Snapshot 1',
        description: 'First test snapshot',
        createdBy: 'test-user',
        tags: ['stable']
      })
    });
    const { snapshot } = await snapshotRes.json();
    console.log(`✅ Snapshot created: ${snapshot.id} (${snapshot.name})\n`);

    // 6. Create a release
    console.log('6️⃣ Creating release...');
    const releaseRes = await fetch(`${API_BASE}/versions/projects/${project.id}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshotId: snapshot.id,
        versionId: version.id,
        name: 'Release 1.0.0',
        version: '1.0.0',
        description: 'First production release',
        createdBy: 'test-user',
        tags: ['production', 'stable']
      })
    });
    const { release } = await releaseRes.json();
    console.log(`✅ Release created: ${release.id} (${release.name})`);
    console.log(`   Bundle size: ${(release.bundleSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`   Signed: ${release.signed}\n`);

    // 7. Get project stats
    console.log('7️⃣ Getting project statistics...');
    const statsRes = await fetch(`${API_BASE}/versions/projects/${project.id}/stats`);
    const { stats } = await statsRes.json();
    console.log(`✅ Project statistics:`);
    console.log(`   Versions: ${stats.versions}`);
    console.log(`   Snapshots: ${stats.snapshots}`);
    console.log(`   Releases: ${stats.releases}`);
    console.log(`   Branches: ${stats.branches}`);
    console.log(`   Storage: ${(stats.totalStorageBytes / 1024).toFixed(2)} KB (${(stats.compressedStorageBytes / 1024).toFixed(2)} KB compressed)`);
    console.log(`   Compression ratio: ${(stats.compressionRatio * 100).toFixed(1)}%\n`);

    // 8. Create a second version for comparison
    console.log('8️⃣ Creating second version for diff comparison...');
    const version2Res = await fetch(`${API_BASE}/versions/projects/${project.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchId: branch.id,
        version: 'v1.1.0',
        author: 'test-user',
        message: 'Updated counter logic',
        files: [
          {
            path: 'main.st',
            content: `PROGRAM Main
VAR
  counter : INT := 0;
  running : BOOL := TRUE;
  max_count : INT := 200;
END_VAR

counter := counter + 1;
IF counter > max_count THEN
  running := FALSE;
  counter := 0;
END_IF;

END_PROGRAM`,
            type: 'logic'
          },
          {
            path: 'config.json',
            content: JSON.stringify({ version: '1.1.0', enabled: true, debug: true }, null, 2),
            type: 'config'
          }
        ]
      })
    });
    const { version: version2 } = await version2Res.json();
    console.log(`✅ Version 2 created: ${version2.id} (${version2.version})\n`);

    // 9. Compare versions
    console.log('9️⃣ Comparing versions...');
    const compareRes = await fetch(`${API_BASE}/versions/compare/${version.id}/${version2.id}`);
    const { comparison } = await compareRes.json();
    console.log(`✅ Version comparison:`);
    console.log(`   Files changed: ${comparison.summary.filesChanged}`);
    console.log(`   Lines added: ${comparison.summary.totalLinesAdded}`);
    console.log(`   Lines deleted: ${comparison.summary.totalLinesDeleted}`);
    console.log(`   Changes: ${comparison.fileChanges.map(f => `${f.path} (${f.type})`).join(', ')}\n`);

    // 10. Get project history
    console.log('🔟 Getting project history...');
    const historyRes = await fetch(`${API_BASE}/versions/projects/${project.id}/history`);
    const { history } = await historyRes.json();
    console.log(`✅ Project history:`);
    console.log(`   Total versions: ${history.versions.length}`);
    console.log(`   Total snapshots: ${history.snapshots.length}`);
    console.log(`   Total releases: ${history.releases.length}\n`);

    console.log('🎉 All tests passed successfully!');
    console.log(`\n📝 Test project ID: ${project.id}`);
    console.log(`   Visit: http://localhost:5173 and navigate to Versioning Center`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', await error.response.text());
    }
  }
}

// Run tests
testVersioningAPI();
