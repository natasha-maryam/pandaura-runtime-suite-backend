const knex = require('knex');

async function checkDatabase(dbPath, name) {
  const db = knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true
  });
  
  try {
    console.log(`\n=== ${name} (${dbPath}) ===`);
    
    // Check tables
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', tables.map(t => t.name).join(', '));
    
    // Check version-related tables if they exist
    const tableNames = tables.map(t => t.name);
    
    if (tableNames.includes('versions')) {
      const versionCount = await db('versions').count('* as count');
      console.log('Versions:', versionCount[0].count);
      
      if (versionCount[0].count > 0) {
        const recentVersions = await db('versions').select('id', 'message', 'author', 'files_changed').orderBy('timestamp', 'desc').limit(3);
        console.log('Recent versions:');
        recentVersions.forEach(v => console.log(`  - ${v.id.substring(0,8)}... | ${v.files_changed} files | "${v.message}" by ${v.author}`));
      }
    }
    
    if (tableNames.includes('snapshots')) {
      const snapshotCount = await db('snapshots').count('* as count');
      console.log('Snapshots:', snapshotCount[0].count);
      
      if (snapshotCount[0].count > 0) {
        const recentSnapshots = await db('snapshots').select('*').orderBy('created_at', 'desc').limit(3);
        console.log('Recent snapshots:');
        recentSnapshots.forEach(s => console.log(`  - ${s.id.substring(0,8)}... | "${s.name}" | Version: ${s.version_id.substring(0,8)}...`));
      }
    }
    
    if (tableNames.includes('version_files')) {
      const filesCount = await db('version_files').count('* as count');
      console.log('Version Files:', filesCount[0].count);
      
      if (filesCount[0].count > 0) {
        const recentFiles = await db('version_files').select('version_id', 'file_path', 'file_type', 'storage_path').limit(5);
        console.log('Recent files:');
        recentFiles.forEach(f => console.log(`  - ${f.file_path} (${f.file_type}) | Storage: ${f.storage_path}`));
      }
    }
    
  } catch (error) {
    console.log('Error:', error.message);
  } finally {
    await db.destroy();
  }
}

async function main() {
  await checkDatabase('./dev.sqlite3', 'Root dev.sqlite3');
  await checkDatabase('./src/db/dev.sqlite3', 'src/db/dev.sqlite3');
  await checkDatabase('./data/pandaura-dev.sqlite3', 'data/pandaura-dev.sqlite3');
}

main().catch(console.error);