import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não foi configurada no arquivo .env");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("connect", () => {
  console.log("CORE FIX conectado ao PostgreSQL!");
});

pool.on("error", (error) => {
  console.error("Erro na conexão com PostgreSQL:", error);
});

export async function testarConexao(): Promise<boolean> {
  try {
    const resultado = await pool.query("SELECT NOW()");

    console.log("Banco de dados funcionando:", resultado.rows[0]);

    return true;
  } catch (error) {
    console.error("Falha ao conectar ao PostgreSQL:", error);

    return false;
  }
}
