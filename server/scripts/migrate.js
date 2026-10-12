// Creates the tables defined in db/schema.sql. Safe to run repeatedly.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Database is ready: users and tasks tables exist.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
