import { pool } from "../database";

// ==========================================
// CONSULTAR CONSUMO DE ENERGIA
// ==========================================

export async function consultarConsumo() {
  const resultado = await pool.query(
    `SELECT
      COALESCE(SUM(valor_atual), 0) AS total,
      COUNT(*)::int AS quantidade
     FROM sensores
     WHERE valor_atual IS NOT NULL
       AND (
         unidade ILIKE '%kwh%'
         OR tipo ILIKE '%energia%'
         OR tipo ILIKE '%consumo%'
       )`
  );

  return {
    total: Number(resultado.rows[0].total),
    quantidade: resultado.rows[0].quantidade,
  };
}

// ==========================================
// CONSULTAR SENSORES
// ==========================================

export async function consultarSensores() {
  const resultado = await pool.query(
    `SELECT
      nome,
      tipo,
      ambiente,
      status,
      valor_atual,
      unidade
     FROM sensores
     ORDER BY nome`
  );

  const ativos = resultado.rows.filter(
    (sensor) => String(sensor.status).toLowerCase() === "ativo"
  );

  return {
    total: resultado.rows.length,
    ativos: ativos.length,
    sensores: resultado.rows,
  };
}

// ==========================================
// CONSULTAR ALERTAS E EVENTOS
// ==========================================

export async function consultarAlertas() {
  const resultado = await pool.query(
    `SELECT
      id,
      tipo,
      descricao,
      gravidade,
      suspeito,
      confianca,
      criado_em
     FROM eventos
     ORDER BY criado_em DESC
     LIMIT 20`
  );

  const suspeitos = resultado.rows.filter(
    (evento) => evento.suspeito
  ).length;

  return {
    total: resultado.rows.length,
    suspeitos,
    eventos: resultado.rows,
  };
}

// ==========================================
// CONSULTAR COMPORTAMENTOS SUSPEITOS
// ==========================================

export async function consultarSuspeitas() {
  const resultado = await pool.query(
    `SELECT
      id,
      tipo,
      descricao,
      gravidade,
      confianca,
      criado_em
     FROM eventos
     WHERE suspeito = TRUE
     ORDER BY criado_em DESC
     LIMIT 20`
  );

  return {
    total: resultado.rows.length,
    eventos: resultado.rows,
  };
}
