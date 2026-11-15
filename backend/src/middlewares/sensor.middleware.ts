import { Request, Response, NextFunction } from "express";
import { pool } from "../database";

// No cadastro, o dono do sensor é sempre quem está logado.
// Ignora qualquer usuario_id enviado no corpo da requisição.
export function definirDonoNoCorpo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (typeof req.body === "object" && req.body !== null) {
    req.body.usuario_id = res.locals.usuario.id;
  }

  next();
}

// Consulta, edição e exclusão só valem para sensor do próprio usuário.
// Sensor de outra pessoa responde 404, como se não existisse.
export async function exigirDonoDoSensor(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = Number(req.params.id);

  // ID inválido segue para o controller, que já responde 400
  if (!Number.isInteger(id) || id <= 0) return next();

  try {
    const r = await pool.query(
      "SELECT 1 FROM sensores WHERE id = $1 AND usuario_id = $2",
      [id, res.locals.usuario.id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ erro: "Sensor não encontrado." });
    }

    return next();
  } catch (error) {
    console.error("Erro ao verificar o dono do sensor:", error);
    return res
      .status(500)
      .json({ erro: "Não foi possível verificar o sensor." });
  }
}
