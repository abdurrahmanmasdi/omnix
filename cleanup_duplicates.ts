import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost:5433/sales_agent?schema=public'
});

async function cleanup() {
  const { rows: duplicates } = await pool.query(`
    SELECT "organizationId", "phoneNumber", array_agg(id) as ids, count(*)
    FROM leads
    GROUP BY "organizationId", "phoneNumber"
    HAVING count(*) > 1
  `);
  
  for (const dup of duplicates) {
    const idsToDelete = dup.ids.slice(1);
    await pool.query(
      `DELETE FROM leads WHERE id = ANY($1)`,
      [idsToDelete]
    );
    console.log(`Deleted ${idsToDelete.length} duplicates for ${dup.phoneNumber}`);
  }
}

cleanup().catch(console.error).finally(() => pool.end());
