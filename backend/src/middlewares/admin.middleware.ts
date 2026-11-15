import { Request, Response, NextFunction } from "express";
import { pool } from "../database";

// Deve ser usado DEPOIS de autenticarToken.
// Consulta o papel no banco a cada requisição: se o admin for rebaixado,
// o acesso é perdido na hora (não depende do token, que dura 8h).
export async function exigirAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const usuario = res.locals.usuario as { id: number | string } | undefined;

    if (!usuario) {
      return res.status(401).json({ erro: "Usuário não autenticado." });
    }

    const resultado = await pool.query(
      "SELECT role FROM usuarios WHERE id = $1",
      [usuario.id]
    );

    if (resultado.rows[0]?.role !== "admin") {
      return res.status(403).json({
        erro: "Acesso restrito a administradores.",
      });
    }

    next();
  } catch (error) {
    console.error("Erro ao verificar permissão:", error);
    return res.status(500).json({ erro: "Erro ao verificar permissão." });
  }
}
