import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bridge_watch',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const queries = [
  {
    name: 'Liquidity snapshots by symbol and time range',
    sql: `
      EXPLAIN ANALYZE
      SELECT * FROM liquidity_snapshots
      WHERE symbol = 'USDC'
      AND time >= NOW() - INTERVAL '7 days'
      ORDER BY time DESC
      LIMIT 100
    `,
  },
  {
    name: 'Price history for symbol',
    sql: `
      EXPLAIN ANALYZE
      SELECT * FROM prices
      WHERE symbol = 'XLM'
      AND time >= NOW() - INTERVAL '24 hours'
      ORDER BY time DESC
    `,
  },
  {
    name: 'Alert events by rule',
    sql: `
      EXPLAIN ANALYZE
      SELECT * FROM alert_events
      WHERE rule_id = (SELECT id FROM alert_rules LIMIT 1)
      AND time >= NOW() - INTERVAL '30 days'
      ORDER BY time DESC
      LIMIT 50
    `,
  },
  {
    name: 'Verification results by bridge',
    sql: `
      EXPLAIN ANALYZE
      SELECT * FROM verification_results
      WHERE bridge_id = (SELECT id FROM bridges LIMIT 1)
      AND verified_at >= NOW() - INTERVAL '7 days'
      ORDER BY verified_at DESC
      LIMIT 100
    `,
  },
  {
    name: 'Health scores time series',
    sql: `
      EXPLAIN ANALYZE
      SELECT * FROM health_scores
      WHERE symbol = 'USDC'
      AND time >= NOW() - INTERVAL '30 days'
      ORDER BY time DESC
    `,
  },
];

async function analyzeQueries() {
  console.log('Database Query Performance Analysis\n');
  console.log('='.repeat(80));
  
  for (const query of queries) {
    console.log(`\n${query.name}`);
    console.log('-'.repeat(80));
    
    try {
      const result = await pool.query(query.sql);
      
      const plan = result.rows.map(r => r['QUERY PLAN']).join('\n');
      console.log(plan);
      
      const executionTime = plan.match(/Execution Time: ([\d.]+) ms/);
      const planningTime = plan.match(/Planning Time: ([\d.]+) ms/);
      const indexScan = plan.includes('Index Scan') || plan.includes('Index Only Scan');
      const seqScan = plan.includes('Seq Scan');
      
      console.log('\nSummary:');
      if (executionTime) console.log(`  Execution Time: ${executionTime[1]} ms`);
      if (planningTime) console.log(`  Planning Time: ${planningTime[1]} ms`);
      console.log(`  Uses Index: ${indexScan ? '✓' : '✗'}`);
      console.log(`  Sequential Scan: ${seqScan ? '⚠' : '✓'}`);
      
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\nIndex Usage Summary');
  console.log('-'.repeat(80));
  
  try {
    const indexUsage = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      AND tablename IN (
        'liquidity_snapshots',
        'prices',
        'health_scores',
        'alert_events',
        'verification_results',
        'bridge_volume_stats',
        'pool_metrics',
        'pool_events'
      )
      ORDER BY tablename, idx_scan DESC
    `);
    
    if (indexUsage.rows.length > 0) {
      console.table(indexUsage.rows);
    } else {
      console.log('No index usage statistics available yet');
    }
  } catch (error) {
    console.log(`Error fetching index usage: ${error.message}`);
  }
  
  await pool.end();
}

analyzeQueries().catch((error) => {
  console.error('Analysis failed:', error);
  process.exit(1);
});
