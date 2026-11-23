import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_NAME = process.env.DB_NAME || 'bridge_watch';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

const OUTPUT_PATH = `${__dirname}/../docs/database-schema.md`;

async function checkTblsInstalled() {
  try {
    await execAsync('which tbls');
    return true;
  } catch {
    return false;
  }
}

async function installTbls() {
  console.log('Installing tbls...');
  const platform = process.platform;
  
  try {
    if (platform === 'darwin') {
      await execAsync('brew install k1LoW/tap/tbls');
    } else if (platform === 'linux') {
      const { stdout } = await execAsync('uname -m');
      const arch = stdout.trim() === 'x86_64' ? 'amd64' : 'arm64';
      await execAsync(
        `curl -sL https://github.com/k1LoW/tbls/releases/latest/download/tbls_linux_${arch}.tar.gz | tar xz && sudo mv tbls /usr/local/bin/`
      );
    } else {
      throw new Error('Unsupported platform. Please install tbls manually from https://github.com/k1LoW/tbls');
    }
    console.log('tbls installed successfully');
  } catch (error) {
    throw new Error(`Failed to install tbls: ${error.message}`);
  }
}

async function generateDocs() {
  const tblsInstalled = await checkTblsInstalled();
  
  if (!tblsInstalled) {
    await installTbls();
  }

  const dsn = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable`;
  
  console.log('Generating database schema documentation...');
  
  try {
    const tempDir = `${__dirname}/../.tbls`;
    await mkdir(tempDir, { recursive: true });
    
    const configContent = `---
dsn: ${dsn}
docPath: ${tempDir}
er:
  format: markdown
  distance: 2
comments:
  - table: "*"
    tableComment: ""
  - table: "*"
    columnComments: {}
lint:
  requireColumnComment:
    enabled: false
  requireTableComment:
    enabled: false
`;
    
    await writeFile(`${tempDir}/.tbls.yml`, configContent);
    
    await execAsync(`cd ${tempDir} && tbls doc`);
    
    const { stdout: schemaContent } = await execAsync(`cd ${tempDir} && cat README.md`);
    
    const enhancedContent = `# Database Schema Documentation

> **Auto-generated** from active PostgreSQL schema using [tbls](https://github.com/k1LoW/tbls)
> 
> Last updated: ${new Date().toISOString()}
> 
> This documentation is automatically synchronized with the database schema.
> To regenerate: \`npm run docs:schema\`

---

${schemaContent}

## TimescaleDB Hypertables

The following tables are configured as TimescaleDB hypertables for efficient time-series data management:

- \`prices\` - Partitioned by \`time\` column
- \`health_scores\` - Partitioned by \`time\` column
- \`liquidity_snapshots\` - Partitioned by \`time\` column
- \`alert_events\` - Partitioned by \`time\` column
- \`verification_results\` - Partitioned by \`verified_at\` column
- \`bridge_volume_hourly\` - Partitioned by \`bucket\` column
- \`asset_liquidity_snapshots\` - Partitioned by \`timestamp\` column

## Indexes

For detailed index information on each table, refer to the individual table documentation above.

## Foreign Key Constraints

All foreign key relationships are documented in the entity relationship diagrams above.

## Maintenance

- **Retention Policies**: Time-series tables have automated retention policies (typically 90 days for raw data)
- **Compression**: Older chunks in hypertables are automatically compressed
- **Vacuum**: Regular VACUUM operations are scheduled for non-hypertable tables
`;

    await writeFile(OUTPUT_PATH, enhancedContent);
    
    await execAsync(`rm -rf ${tempDir}`);
    
    console.log(`\n✓ Schema documentation generated: ${OUTPUT_PATH}`);
  } catch (error) {
    throw new Error(`Failed to generate schema docs: ${error.message}`);
  }
}

generateDocs().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
