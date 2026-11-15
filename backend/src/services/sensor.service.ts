import { pool } from "../database";

// ==========================================
// TIPOS DOS SENSORES
// ==========================================

export interface Sensor {
  id: number;
  usuario_id: number | null;
  nome: string;
  tipo: string;
  ambiente: string | null;
  status: string | null;
  valor_atual: number | string | null;
  unidade: string | null;
  ultima_atividade: Date | null;
  criado_em: Date | null;
}

export interface NovoSensor {
  usuario_id?: number | null;
  nome: string;
  tipo: string;
  ambiente?: string | null;
  status?: string;
  valor_atual?: number | null;
  unidade?: string | null;
}

export interface AtualizacaoSensor {
  nome?: string;
  tipo?: string;
  ambiente?: string | null;
  status?: string;
  valor_atual?: number | null;
  unidade?: string | null;
}

// ==========================================
// LISTAR SENSORES
// ==========================================

export async function listarTodosSensores() {
  const resultado = await pool.query<Sensor>(
    `SELECT
      id,
      usuario_id,
      nome,
      tipo,
      ambiente,
      status,
      valor_atual,
      unidade,
      ultima_atividade,
      criado_em
     FROM sensores
     ORDER BY id DESC`
  );

  return {
    total: resultado.rowCount ?? 0,
    sensores: resultado.rows,
  };
}

// ==========================================
// CONSULTAR SENSOR POR ID
// ==========================================

export async function buscarSensorPorId(
  id: number
): Promise<Sensor | null> {
  const resultado = await pool.query<Sensor>(
    `SELECT
      id,
      usuario_id,
      nome,
      tipo,
      ambiente,
      status,
      valor_atual,
      unidade,
      ultima_atividade,
      criado_em
     FROM sensores
     WHERE id = $1`,
    [id]
  );

  return resultado.rows[0] ?? null;
}

// ==========================================
// CADASTRAR SENSOR
// ==========================================

export async function criarSensor(
  dados: NovoSensor
): Promise<Sensor> {
  const resultado = await pool.query<Sensor>(
    `INSERT INTO sensores
      (
        usuario_id,
        nome,
        tipo,
        ambiente,
        status,
        valor_atual,
        unidade,
        ultima_atividade
      )
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      dados.usuario_id ?? null,
      dados.nome,
      dados.tipo,
      dados.ambiente ?? null,
      dados.status ?? "ativo",
      dados.valor_atual ?? null,
      dados.unidade ?? null,
    ]
  );

  return resultado.rows[0];
}

// ==========================================
// ATUALIZAR SENSOR
// ==========================================

export async function atualizarDadosSensor(
  id: number,
  dados: AtualizacaoSensor
): Promise<Sensor | null> {
  const camposPermitidos: (keyof AtualizacaoSensor)[] = [
    "nome",
    "tipo",
    "ambiente",
    "status",
    "valor_atual",
    "unidade",
  ];

  const atualizacoes: string[] = [];
  const valores: unknown[] = [];

  for (const campo of camposPermitidos) {
    const valor = dados[campo];

    if (valor !== undefined) {
      valores.push(valor);
      atualizacoes.push(`${campo} = $${valores.length}`);
    }
  }

  if (atualizacoes.length === 0) {
    return null;
  }

  atualizacoes.push("ultima_atividade = CURRENT_TIMESTAMP");

  valores.push(id);

  const resultado = await pool.query<Sensor>(
    `UPDATE sensores
     SET ${atualizacoes.join(", ")}
     WHERE id = $${valores.length}
     RETURNING *`,
    valores
  );

  return resultado.rows[0] ?? null;
}

// ==========================================
// EXCLUIR SENSOR
// ==========================================

export async function removerSensor(
  id: number
): Promise<{ id: number } | null> {
  const resultado = await pool.query<{ id: number }>(
    `DELETE FROM sensores
     WHERE id = $1
     RETURNING id`,
    [id]
  );

  return resultado.rows[0] ?? null;
}
