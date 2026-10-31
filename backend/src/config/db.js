const fs = require('fs');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'mysql-service',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'bloguser',
  password: process.env.DB_PASSWORD || 'changeme',
  database: process.env.DB_NAME || 'blogdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
};

if (process.env.DB_SSL === 'true') {
  dbConfig.ssl = {
    ca: fs.readFileSync(
      process.env.DB_SSL_CA || '/app/certs/global-bundle.pem',
      'utf8'
    ),
    rejectUnauthorized: true,
  };
}

const pool = mysql.createPool(dbConfig);

async function checkDbConnection() {
  const conn = await pool.getConnection();

  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = { pool, checkDbConnection };
