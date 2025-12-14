// migrations/add_campaign_table_fields.js
// Migration: Add table_labels and table_values to campaigns table

const { dbQuery } = require('../services/db');

async function up() {
  console.log('[Migration] Adding table_labels and table_values columns to campaigns table...');

  try {
    // Add columns for table data as JSONB arrays
    await dbQuery(`
      ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS table_labels JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS table_values JSONB DEFAULT '[]'::jsonb;
    `);

    // Add comments
    await dbQuery(`
      COMMENT ON COLUMN campaigns.table_labels IS 'キャンペーン詳細表のラベル配列';
    `);

    await dbQuery(`
      COMMENT ON COLUMN campaigns.table_values IS 'キャンペーン詳細表の値配列';
    `);

    console.log('[Migration] ✓ Successfully added table_labels and table_values columns');
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Failed to add columns:', error.message);
    throw error;
  }
}

async function down() {
  console.log('[Migration] Removing table_labels and table_values columns from campaigns table...');

  try {
    await dbQuery(`
      ALTER TABLE campaigns
        DROP COLUMN IF EXISTS table_labels,
        DROP COLUMN IF EXISTS table_values;
    `);

    console.log('[Migration] ✓ Successfully removed table_labels and table_values columns');
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Failed to remove columns:', error.message);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  const action = process.argv[2] || 'up';

  const run = action === 'down' ? down : up;

  run()
    .then(() => {
      console.log('[Migration] Complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] Error:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
