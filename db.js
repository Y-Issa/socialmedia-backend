import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  database: process.env.DB_NAME || "social",
  password: process.env.POSTGRES_PASSWORD,
});

export default pool;

// The database schema lives in schema.sql. Create the database, then run:
//   psql -U postgres -p <port> -d social -f schema.sql
