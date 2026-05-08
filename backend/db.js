const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const target = (process.env.DB_TARGET || 'mysql').toLowerCase();

function buildConfig() {
  if (target === 'tidb') {
    const sslCa = process.env.TIDB_SSL_CA;
    return {
      host: process.env.TIDB_HOST,
      port: Number(process.env.TIDB_PORT || 4000),
      user: process.env.TIDB_USER,
      password: process.env.TIDB_PASSWORD,
      database: process.env.TIDB_DATABASE,
      ssl: sslCa && fs.existsSync(sslCa)
        ? { ca: fs.readFileSync(sslCa) }
        : { rejectUnauthorized: true },
      multipleStatements: true,
      waitForConnections: true,
      connectionLimit: 10,
    };
  }
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'databaseProject_db',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
  };
}

const pool = mysql.createPool(buildConfig());

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function execute(sql, params) {
  const [result] = await pool.execute(sql, params);
  return result;
}

module.exports = { pool, query, execute, target };
