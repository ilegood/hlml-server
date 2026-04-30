import mysql from 'mysql2/promise';

async function check() {
  const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "qwer1234",
    database: "hlml",
  });

  try {
    const [relations] = await pool.query("SELECT * FROM user_relations");
    console.log("--- RELATIONS ---");
    console.table(relations);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
