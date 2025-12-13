// migrations/add_partner_pickup_address.js
// Migration: Add pickup_address_id to partners table

const { dbQuery } = require('../services/db');

async function up() {
  console.log('[Migration] Adding pickup_address_id column to partners table...');

  try {
    // Add column
    await dbQuery(`
      ALTER TABLE partners
        ADD COLUMN IF NOT EXISTS pickup_address_id UUID;
    `);

    // Add comment
    await dbQuery(`
      COMMENT ON COLUMN partners.pickup_address_id IS '畑受け取りで使用する住所ID（addresses.idを参照）';
    `);

    console.log('[Migration] ✓ Successfully added pickup_address_id column');
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Failed to add column:', error.message);
    throw error;
  }
}

async function down() {
  console.log('[Migration] Removing pickup_address_id column from partners table...');

  try {
    await dbQuery(`
      ALTER TABLE partners
        DROP COLUMN IF EXISTS pickup_address_id;
    `);

    console.log('[Migration] ✓ Successfully removed pickup_address_id column');
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Failed to remove column:', error.message);
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

