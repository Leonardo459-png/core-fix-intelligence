import { Request, Response } from "express";
import {
  obterResumo,
  listarUsuarios,
  contarAdmins,
  buscarUsuario,
  alterarPapel,
  excluirUsuario,
  listarSensoresAdmin,
  alterarStatusSensor,
  listarEventos,
  dadosRelatorio,
  listarResidencias,
  obterSeguranca,
  registrarAuditoria,
  listarAuditoria,
  Papel,
} from "../services/admin.service";

const STATUS_VALIDOS = ["ativo", "inativo", "manutencao"];

function idValido(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function dataValida(valor: unknown): string | undefined {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? valor
    : undefined;
}

function erroInterno(res: Response, contexto: string, error: unknown) {
  console.error(`Erro admin (${contexto}):`, error);
  return res.status(500).json({ erro: `Não foi possível ${contexto}.` });
}

export async function resumo(_req: Request, res: Response) {
  try {
    return res.json(await obterResumo());
  } catch (e) {
    return erroInterno(res, "carregar o resumo", e);
  }
}

export async function usuarios(_req: Request, res: Response) {
  try {
    return res.json({ usuarios: await listarUsuarios() });
  } catch (e) {
    return erroInterno(res, "listar os usuários", e);
  }
}

export async function mudarPapel(req: Request, res: Response) {
  try {
    const id = idValido(req.params.id);
    const papel = req.body?.papel as Papel;

    if (!id) return res.status(400).json({ erro: "ID inválido." });
    if (papel !== "admin" && papel !== "usuario") {
      return res.status(400).json({ erro: "Papel deve ser 'admin' ou 'usuario'." });
    }

    const alvo = await buscarUsuario(id);
    if (!alvo) return res.status(404).json({ erro: "Usuário não encontrado." });

    // Regra de segurança: o sistema nunca pode ficar sem administrador
    if (alvo.role === "admin" && papel === "usuario" && (await contarAdmins()) <= 1) {
      return res.status(409).json({
        erro: "Não é possível rebaixar o único administrador do sistema.",
      });
    }

    const atualizado = await alterarPapel(id, papel);
    await registrarAuditoria(
      res.locals.usuario.id,
      "alterar_papel",
      alvo.email,
      `Papel alterado de ${alvo.role} para ${papel}`
    );
    return res.json({ usuario: atualizado });
  } catch (e) {
    return erroInterno(res, "alterar o papel", e);
  }
}

export async function removerUsuario(req: Request, res: Response) {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ erro: "ID inválido." });

    if (Number(res.locals.usuario.id) === id) {
      return res.status(409).json({ erro: "Você não pode excluir a própria conta." });
    }

    const alvo = await buscarUsuario(id);
    if (!alvo) return res.status(404).json({ erro: "Usuário não encontrado." });

    if (alvo.role === "admin" && (await contarAdmins()) <= 1) {
      return res.status(409).json({
        erro: "Não é possível excluir o único administrador do sistema.",
      });
    }

    await excluirUsuario(id);
    await registrarAuditoria(
      res.locals.usuario.id,
      "excluir_usuario",
      alvo.email,
      `Usuário ${alvo.nome} excluído`
    );
    return res.json({ mensagem: "Usuário excluído com sucesso." });
  } catch (e) {
    // 23503 = violação de chave estrangeira (usuário ainda tem dados vinculados)
    if ((e as { code?: string }).code === "23503") {
      return res.status(409).json({
        erro: "Este usuário possui dados vinculados e não pode ser excluído.",
      });
    }
    return erroInterno(res, "excluir o usuário", e);
  }
}

export async function sensores(_req: Request, res: Response) {
  try {
    return res.json({ sensores: await listarSensoresAdmin() });
  } catch (e) {
    return erroInterno(res, "listar os sensores", e);
  }
}

export async function mudarStatusSensor(req: Request, res: Response) {
  try {
    const id = idValido(req.params.id);
    const status = req.body?.status;

    if (!id) return res.status(400).json({ erro: "ID inválido." });
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({
        erro: `Status deve ser um destes: ${STATUS_VALIDOS.join(", ")}.`,
      });
    }

    const sensor = await alterarStatusSensor(id, status);
    if (!sensor) return res.status(404).json({ erro: "Sensor não encontrado." });

    await registrarAuditoria(
      res.locals.usuario.id,
      "alterar_sensor",
      sensor.nome,
      `Status do sensor alterado para ${status}`
    );
    return res.json({ sensor });
  } catch (e) {
    return erroInterno(res, "alterar o sensor", e);
  }
}

function lerFiltro(req: Request) {
  const s = req.query.suspeito;
  return {
    suspeito: s === "true" ? true : s === "false" ? false : undefined,
    de: dataValida(req.query.de),
    ate: dataValida(req.query.ate),
  };
}

export async function eventos(req: Request, res: Response) {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 20, 1), 100);
    const pagina = Math.max(Number(req.query.pagina) || 1, 1);

    const resultado = await listarEventos({
      ...lerFiltro(req),
      limite,
      deslocamento: (pagina - 1) * limite,
    });

    return res.json({ ...resultado, pagina, limite });
  } catch (e) {
    return erroInterno(res, "listar os eventos", e);
  }
}

// Evita "injeção de fórmula" ao abrir o CSV no Excel (=, +, -, @ no início)
function celulaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let texto =
    valor instanceof Date ? valor.toISOString() : String(valor);
  // só texto: números negativos (ex.: -5 °C) devem continuar numéricos
  if (typeof valor === "string" && /^[=+\-@\t\r]/.test(texto)) {
    texto = `'${texto}`;
  }
  return `"${texto.replace(/"/g, '""')}"`;
}

export async function relatorio(req: Request, res: Response) {
  try {
    const tipo = req.query.tipo;
    if (tipo !== "eventos" && tipo !== "sensores" && tipo !== "usuarios") {
      return res.status(400).json({
        erro: "Informe tipo=eventos, tipo=sensores ou tipo=usuarios.",
      });
    }

    const linhas = await dadosRelatorio(tipo, lerFiltro(req));
    const colunas = linhas.length ? Object.keys(linhas[0]) : [];

    // BOM + ";" para o Excel brasileiro abrir com acentos e colunas corretas
    const csv =
      "﻿" +
      [
        colunas.join(";"),
        ...linhas.map((l) => colunas.map((c) => celulaCsv(l[c])).join(";")),
      ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="corefix-${tipo}.csv"`
    );
    return res.send(csv);
  } catch (e) {
    return erroInterno(res, "gerar o relatório", e);
  }
}

export async function residencias(_req: Request, res: Response) {
  try {
    return res.json({ residencias: await listarResidencias() });
  } catch (e) {
    return erroInterno(res, "listar as residências", e);
  }
}

export async function seguranca(_req: Request, res: Response) {
  try {
    const [resumoSeguranca, auditoria] = await Promise.all([
      obterSeguranca(),
      listarAuditoria(15),
    ]);
    return res.json({ ...resumoSeguranca, auditoria });
  } catch (e) {
    return erroInterno(res, "carregar a segurança", e);
  }
}
