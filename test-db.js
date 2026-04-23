import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "qwer1234", // 본인 비밀번호로 수정 필수
  database: "hlml",
});

async function test() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");
    
    const [rows] = await connection.query("SHOW TABLES LIKE 'posts'");
    if (rows.length > 0) {
      console.log("✅ 'posts' table exists");
      const [columns] = await connection.query("DESCRIBE posts");
      console.log("Table columns:", columns.map(c => c.Field));
    } else {
      console.log("❌ 'posts' table does NOT exist");
    }
    
    connection.release();
  } catch (err) {
    console.error("❌ Database error:", err.message);
  } finally {
    process.exit();
  }
}

test();
