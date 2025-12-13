// migrations/add_order_receipt_name.js
// Migration: Add receipt_name to orders table

const { dbQuery } = require('../services/db');

async function up() {
  console.log('[Migration] Adding receipt_name column to orders table...');

  try {
    // Add column
    await dbQuery(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS receipt_name TEXT;
    `);

    // Add check constraint
    await dbQuery(`
      ALTER TABLE orders
        DROP CONSTRAINT IF EXISTS orders_receipt_name_length_check;
    `);
    await dbQuery(`
      ALTER TABLE orders
        ADD CONSTRAINT orders_receipt_name_length_check
        CHECK (receipt_name IS NULL OR (length(receipt_name) >= 1 AND length(receipt_name) <= 40));
    `);

    // Add comment
    await dbQuery(`
      COMMENT ON COLUMN orders.receipt_name IS '領収書の宛名（1〜40文字）';
    `);

    console.log('[Migration] ✓ Successfully added receipt_name column');
    return true;
  } catch (error) {
    console.error('[Migration] ✗ Failed to add column:', error.message);
    throw error;
  }
}

async function down() {
  console.log('[Migration] Removing receipt_name column from orders table...');

  try {
    await dbQuery(`
      ALTER TABLE orders
        DROP CONSTRAINT IF EXISTS orders_receipt_name_length_check;
    `);
    await dbQuery(`
      ALTER TABLE orders
        DROP COLUMN IF EXISTS receipt_name;
    `);

    console.log('[Migration] ✓ Successfully removed receipt_name column');
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

