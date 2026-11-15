import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface DadosToken {
  id: number | string;
  email: string;
}

export function autenticarToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const autorizacao = req.headers.authorization;

    if (!autorizacao || !autorizacao.startsWith("Bearer ")) {
      return res.status(401).json({
        erro: "Token de autenticação não informado.",
      });
    }

    const token = autorizacao.split(" ")[1];
    const chave = process.env.JWT_SECRET;

    if (!chave) {
      console.error("JWT_SECRET não configurada.");

      return res.status(500).json({
        erro: "Erro na configuração da autenticação.",
      });
    }

    const decodificado = jwt.verify(token, chave);

    if (
      typeof decodificado === "string" ||
      !decodificado ||
      (typeof decodificado.id !== "number" &&
        typeof decodificado.id !== "string") ||
      typeof decodificado.email !== "string"
    ) {
      return res.status(401).json({
        erro: "Token inválido.",
      });
    }

    const usuario: DadosToken = {
      id: decodificado.id,
      email: decodificado.email,
    };

    res.locals.usuario = usuario;

    next();
  } catch {
    return res.status(401).json({
      erro: "Token inválido ou expirado.",
    });
  }
}
