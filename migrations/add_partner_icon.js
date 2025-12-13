// migrations/add_partner_icon.js
// Migration: Add icon_url and icon_r2_key to partners table

const { dbQuery } = require('../services/db');

async function up() {
  console.log('[Migration] Adding icon_url and icon_r2_key columns to partners table...');

  try {
    // Add columns
    await dbQuery(`
      ALTER TABLE partners
        ADD COLUMN IF NOT EXISTS icon_url TEXT,
        ADD COLUMN IF NOT EXISTS icon_r2_key TEXT;
    `);

    // Add comments
    await dbQuery(`
      COMMENT ON COLUMN partners.icon_url IS '出品者アイコン画像のURL（R2）';
    `);

    await dbQuery(`
      COMMENT ON COLUMN partners.icon_r2_key IS '出品者アイコンのR2キー（重複検出用）';
    `);

    console.log('[Migration] ✓ Successfully added icon_url and icon_r2_key columns');
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Failed to add columns:', error.message);
    throw error;
  }
}

async function down() {
  console.log('[Migration] Removing icon_url and icon_r2_key columns from partners table...');

  try {
    await dbQuery(`
      ALTER TABLE partners
        DROP COLUMN IF EXISTS icon_url,
        DROP COLUMN IF EXISTS icon_r2_key;
    `);

    console.log('[Migration] ✓ Successfully removed icon_url and icon_r2_key columns');
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
