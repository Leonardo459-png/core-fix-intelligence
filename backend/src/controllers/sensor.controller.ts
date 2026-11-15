import { Request, Response } from "express";

import {
  listarTodosSensores,
  buscarSensorPorId,
  criarSensor,
  atualizarDadosSensor,
  removerSensor,
  AtualizacaoSensor,
} from "../services/sensor.service";

// ==========================================
// FUNÇÕES AUXILIARES DE VALIDAÇÃO
// ==========================================

function corpoValido(
  body: unknown
): body is Record<string, unknown> {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body)
  );
}

function erroChaveEstrangeira(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23503"
  );
}

// ==========================================
// LISTAR SENSORES
// ==========================================

export async function listarSensores(
  _req: Request,
  res: Response
) {
  try {
    const resultado = await listarTodosSensores();

    // Cada pessoa vê somente os próprios sensores (o dono vem do token)
    const donoId = Number(res.locals.usuario?.id);
    const doDono = (s: { usuario_id?: number | null }) =>
      Number(s.usuario_id) === donoId;

    if (Array.isArray(resultado)) {
      return res.json(resultado.filter(doDono));
    }

    if (resultado && Array.isArray(resultado.sensores)) {
      const sensores = resultado.sensores.filter(doDono);

      return res.json({
        ...resultado,
        total_sensores: sensores.length,
        sensores,
      });
    }

    return res.json(resultado);

  } catch (error) {
    console.error("Erro ao listar sensores:", error);

    return res.status(500).json({
      erro: "Não foi possível listar os sensores.",
    });
  }
}

// ==========================================
// CONSULTAR SENSOR POR ID
// ==========================================

export async function consultarSensor(
  req: Request,
  res: Response
) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do sensor inválido.",
      });
    }

    const sensor = await buscarSensorPorId(id);

    if (!sensor) {
      return res.status(404).json({
        erro: "Sensor não encontrado.",
      });
    }

    return res.json(sensor);

  } catch (error) {
    console.error("Erro ao consultar sensor:", error);

    return res.status(500).json({
      erro: "Não foi possível consultar o sensor.",
    });
  }
}

// ==========================================
// CADASTRAR SENSOR
// ==========================================

export async function cadastrarSensor(
  req: Request,
  res: Response
) {
  try {
    if (!corpoValido(req.body)) {
      return res.status(400).json({
        erro: "Informe dados válidos para cadastrar o sensor.",
      });
    }

    const {
      usuario_id,
      nome,
      tipo,
      ambiente,
      status,
      valor_atual,
      unidade,
    } = req.body;

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      typeof tipo !== "string" ||
      !tipo.trim()
    ) {
      return res.status(400).json({
        erro: "Nome e tipo do sensor são obrigatórios.",
      });
    }

    if (
      usuario_id !== undefined &&
      usuario_id !== null &&
      (
        String(usuario_id).trim() === "" ||
        !Number.isInteger(Number(usuario_id)) ||
        Number(usuario_id) <= 0
      )
    ) {
      return res.status(400).json({
        erro: "ID do usuário inválido.",
      });
    }

    if (
      ambiente !== undefined &&
      ambiente !== null &&
      (typeof ambiente !== "string" || !ambiente.trim())
    ) {
      return res.status(400).json({
        erro: "O ambiente precisa ser um texto válido.",
      });
    }

    if (
      unidade !== undefined &&
      unidade !== null &&
      (typeof unidade !== "string" || !unidade.trim())
    ) {
      return res.status(400).json({
        erro: "A unidade precisa ser um texto válido.",
      });
    }

    if (
      status !== undefined &&
      (typeof status !== "string" || !status.trim())
    ) {
      return res.status(400).json({
        erro: "O status precisa ser um texto válido.",
      });
    }

    if (
      valor_atual !== undefined &&
      valor_atual !== null &&
      (
        String(valor_atual).trim() === "" ||
        !Number.isFinite(Number(valor_atual))
      )
    ) {
      return res.status(400).json({
        erro: "O valor atual precisa ser numérico.",
      });
    }

    const sensor = await criarSensor({
      usuario_id:
        usuario_id == null ? null : Number(usuario_id),
      nome: nome.trim(),
      tipo: tipo.trim(),
      ambiente:
        ambiente == null ? null : ambiente.trim(),
      status: status === undefined ? "ativo" : status.trim(),
      valor_atual:
        valor_atual == null ? null : Number(valor_atual),
      unidade:
        unidade == null ? null : unidade.trim(),
    });

    return res.status(201).json({
      mensagem: "Sensor cadastrado com sucesso!",
      sensor,
    });

  } catch (error) {
    console.error("Erro ao cadastrar sensor:", error);

    if (erroChaveEstrangeira(error)) {
      return res.status(400).json({
        erro: "O usuário informado não existe.",
      });
    }

    return res.status(500).json({
      erro: "Não foi possível cadastrar o sensor.",
    });
  }
}

// ==========================================
// ATUALIZAR SENSOR
// ==========================================

export async function atualizarSensor(
  req: Request,
  res: Response
) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do sensor inválido.",
      });
    }

    if (!corpoValido(req.body)) {
      return res.status(400).json({
        erro: "Informe dados válidos para atualização.",
      });
    }

    const camposPermitidos = [
      "nome",
      "tipo",
      "ambiente",
      "status",
      "valor_atual",
      "unidade",
    ];

    const dadosAtualizados: AtualizacaoSensor = {};

    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) {
        Object.assign(dadosAtualizados, {
          [campo]: req.body[campo],
        });
      }
    }

    if (Object.keys(dadosAtualizados).length === 0) {
      return res.status(400).json({
        erro: "Informe pelo menos um campo válido para atualizar.",
      });
    }

    for (const campo of ["nome", "tipo"] as const) {
      const valor = dadosAtualizados[campo];

      if (
        valor !== undefined &&
        (typeof valor !== "string" || !valor.trim())
      ) {
        return res.status(400).json({
          erro: `${campo} precisa ser um texto válido.`,
        });
      }

      if (typeof valor === "string") {
        dadosAtualizados[campo] = valor.trim();
      }
    }

    for (const campo of ["ambiente", "unidade"] as const) {
      const valor = dadosAtualizados[campo];

      if (
        valor !== undefined &&
        valor !== null &&
        (typeof valor !== "string" || !valor.trim())
      ) {
        return res.status(400).json({
          erro: `${campo} precisa ser um texto válido.`,
        });
      }

      if (typeof valor === "string") {
        dadosAtualizados[campo] = valor.trim();
      }
    }

    if (
      dadosAtualizados.status !== undefined &&
      (
        typeof dadosAtualizados.status !== "string" ||
        !dadosAtualizados.status.trim()
      )
    ) {
      return res.status(400).json({
        erro: "O status precisa ser um texto válido.",
      });
    }

    if (dadosAtualizados.status) {
      dadosAtualizados.status = dadosAtualizados.status.trim();
    }

    if (
      dadosAtualizados.valor_atual !== undefined &&
      dadosAtualizados.valor_atual !== null
    ) {
      const valor = dadosAtualizados.valor_atual;

      if (
        String(valor).trim() === "" ||
        !Number.isFinite(Number(valor))
      ) {
        return res.status(400).json({
          erro: "O valor atual precisa ser numérico.",
        });
      }

      dadosAtualizados.valor_atual = Number(valor);
    }

    const sensor = await atualizarDadosSensor(
      id,
      dadosAtualizados
    );

    if (!sensor) {
      return res.status(404).json({
        erro: "Sensor não encontrado.",
      });
    }

    return res.json({
      mensagem: "Sensor atualizado com sucesso!",
      sensor,
    });

  } catch (error) {
    console.error("Erro ao atualizar sensor:", error);

    return res.status(500).json({
      erro: "Não foi possível atualizar o sensor.",
    });
  }
}

// ==========================================
// EXCLUIR SENSOR
// ==========================================

export async function excluirSensor(
  req: Request,
  res: Response
) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: "ID do sensor inválido.",
      });
    }

    const sensor = await removerSensor(id);

    if (!sensor) {
      return res.status(404).json({
        erro: "Sensor não encontrado.",
      });
    }

    return res.json({
      mensagem: "Sensor excluído com sucesso!",
      id: sensor.id,
    });

  } catch (error) {
    console.error("Erro ao excluir sensor:", error);

    return res.status(500).json({
      erro: "Não foi possível excluir o sensor.",
    });
  }
}
