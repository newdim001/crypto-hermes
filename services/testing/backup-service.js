/**
 * Data Backup Service - 3-2-1 Rule
 * 3 copies of data, 2 different media types, 1 off-site
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BackupService {
  constructor(config = {}) {
    this.sourceDir = config.sourceDir || path.join(__dirname, '../../data');
    this.backupDir = config.backupDir || path.join(__dirname, '../../backups');
    this.offSiteDir = config.offSiteDir || '/Users/suren/Dropbox/crypto-bot-backups'; // Example off-site
    this.retentionDays = config.retentionDays || 30;
    this.compression = config.compression || true;
  }

  // Create backup directory structure
  ensureDirectories() {
    const dirs = [this.backupDir, path.join(this.backupDir, 'daily'), path.join(this.backupDir, 'weekly')];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created: ${dir}`);
      }
    });
  }

  // Get list of files to backup
  getFilesToBackup() {
    const files = [];
    const ignore = ['node_modules', '.git', 'backups'];
    
    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      
      fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (!ignore.includes(file)) {
            scanDir(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      });
    };
    
    scanDir(this.sourceDir);
    return files;
  }

  // Create timestamped backup
  createBackup(type = 'daily') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${type}-${timestamp}`;
    const backupPath = path.join(this.backupDir, type, backupName);
    
    console.log(`\n🔐 Creating ${type} backup: ${backupName}`);
    
    // Ensure directories
    this.ensureDirectories();
    
    // Get files
    const files = this.getFilesToBackup();
    console.log(`📄 Backing up ${files.length} files...`);
    
    // Create backup manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      type,
      sourceDir: this.sourceDir,
      files: files.map(f => ({
        path: f,
        relativePath: path.relative(this.sourceDir, f),
        size: fs.statSync(f).size,
        modified: fs.statSync(f).mtime,
      })),
    };
    
    // Write manifest
    fs.writeFileSync(
      path.join(backupPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Copy files
    fs.mkdirSync(backupPath, { recursive: true });
    files.forEach(file => {
      const relativePath = path.relative(this.sourceDir, file);
      const destPath = path.join(backupPath, relativePath);
      const destDir = path.dirname(destPath);
      
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      fs.copyFileSync(file, destPath);
    });
    
    // Compress if enabled
    if (this.compression) {
      this.compressBackup(backupPath, backupName);
    }
    
    // Off-site sync (if configured)
    if (this.offSiteDir && fs.existsSync(path.dirname(this.offSiteDir))) {
      this.syncOffSite(backupPath, backupName);
    }
    
    // Cleanup old backups
    this.cleanupOldBackups(type);
    
    console.log(`✅ Backup complete: ${backupPath}`);
    
    return {
      path: backupPath,
      files: files.length,
      timestamp: manifest.timestamp,
    };
  }

  // Compress backup
  compressBackup(backupPath, backupName) {
    try {
      const parentDir = path.dirname(backupPath);
      console.log('🗜️ Compressing backup...');
      execSync(`cd "${parentDir}" && zip -r "${backupName}.zip" "${backupName}"`, {
        stdio: 'pipe'
      });
      
      // Remove uncompressed
      execSync(`rm -rf "${backupPath}"`);
      console.log('✅ Compression complete');
    } catch (err) {
      console.warn('⚠️ Compression failed, keeping uncompressed:', err.message);
    }
  }

  // Sync to off-site location
  syncOffSite(backupPath, backupName) {
    try {
      console.log('☁️ Syncing to off-site location...');
      
      const ext = this.compression ? '.zip' : '';
      const source = path.join(path.dirname(backupPath), backupName + ext);
      const dest = path.join(this.offSiteDir, backupName + ext);
      
      if (!fs.existsSync(path.dirname(this.offSiteDir))) {
        fs.mkdirSync(path.dirname(this.offSiteDir), { recursive: true });
      }
      
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
        console.log(`✅ Synced to off-site: ${dest}`);
      }
    } catch (err) {
      console.warn('⚠️ Off-site sync failed:', err.message);
    }
  }

  // Cleanup old backups
  cleanupOldBackups(type) {
    const backupTypeDir = path.join(this.backupDir, type);
    if (!fs.existsSync(backupTypeDir)) return;
    
    const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    
    fs.readdirSync(backupTypeDir).forEach(item => {
      const itemPath = path.join(backupTypeDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.mtimeMs < cutoff) {
        execSync(`rm -rf "${itemPath}"`);
        console.log(`🗑️ Removed old backup: ${item}`);
      }
    });
  }

  // Verify backup integrity
  verifyBackup(backupPath) {
    const manifestPath = path.join(backupPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, error: 'Manifest not found' };
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let missing = 0;
    
    manifest.files.forEach(file => {
      const filePath = path.join(backupPath, file.relativePath);
      if (!fs.existsSync(filePath)) {
        missing++;
      }
    });
    
    return {
      valid: missing === 0,
      totalFiles: manifest.files.length,
      missingFiles: missing,
    };
  }

  // List available backups
  listBackups() {
    const backups = { daily: [], weekly: [] };
    
    Object.keys(backups).forEach(type => {
      const typeDir = path.join(this.backupDir, type);
      if (fs.existsSync(typeDir)) {
        fs.readdirSync(typeDir).forEach(item => {
          const itemPath = path.join(typeDir, item);
          const stat = fs.statSync(itemPath);
          backups[type].push({
            name: item,
            path: itemPath,
            size: stat.size,
            created: stat.mtime,
          });
        });
      }
    });
    
    return backups;
  }

  // Restore from backup
  restore(backupName, targetDir = null) {
    const restorePath = path.join(this.backupDir, backupName);
    
    if (!fs.existsSync(restorePath)) {
      console.error(`❌ Backup not found: ${backupName}`);
      return false;
    }
    
    const target = targetDir || this.sourceDir;
    console.log(`📥 Restoring to: ${target}`);
    
    const manifest = JSON.parse(fs.readFileSync(path.join(restorePath, 'manifest.json'), 'utf8'));
    
    manifest.files.forEach(file => {
      const sourcePath = path.join(restorePath, file.relativePath);
      const destPath = path.join(target, file.relativePath);
      
      if (fs.existsSync(sourcePath)) {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(sourcePath, destPath);
      }
    });
    
    console.log('✅ Restore complete');
    return true;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const backup = new BackupService({
    sourceDir: path.join(__dirname, '../../data'),
    backupDir: path.join(__dirname, '../../backups'),
    retentionDays: 30,
  });

  switch (command) {
    case 'daily':
      backup.createBackup('daily');
      break;
    case 'weekly':
      backup.createBackup('weekly');
      break;
    case 'list':
      console.log('\n📋 Available Backups:\n', JSON.stringify(backup.listBackups(), null, 2));
      break;
    case 'restore':
      if (args[1]) {
        backup.restore(args[1]);
      } else {
        console.log('Usage: node backup.js restore <backup-name>');
      }
      break;
    default:
      console.log('Usage: node backup.js [daily|weekly|list|restore <name>]');
  }
}

module.exports = { BackupService };
