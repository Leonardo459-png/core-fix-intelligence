import { pool } from "../database";

export type Papel = "usuario" | "admin";

export interface FiltroEventos {
  suspeito?: boolean;
  de?: string;
  ate?: string;
  limite: number;
  deslocamento: number;
}

export async function obterResumo() {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM usuarios)::int                         AS usuarios,
      (SELECT COUNT(*) FROM usuarios WHERE role = 'admin')::int    AS administradores,
      (SELECT COUNT(*) FROM sensores)::int                         AS sensores,
      (SELECT COUNT(*) FROM sensores WHERE status = 'ativo')::int  AS sensores_ativos,
      (SELECT COUNT(*) FROM eventos)::int                          AS eventos,
      (SELECT COUNT(*) FROM eventos WHERE suspeito = TRUE)::int    AS eventos_suspeitos
  `);

  // Eventos dos últimos 7 dias (um ponto por dia, mesmo sem eventos)
  const serie = await pool.query(`
    SELECT to_char(d, 'DD/MM') AS dia,
           COUNT(e.id)::int AS total,
           (COUNT(e.id) FILTER (WHERE e.suspeito = TRUE))::int AS suspeitos
    FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') AS d
    LEFT JOIN eventos e
      ON e.criado_em >= d AND e.criado_em < d + INTERVAL '1 day'
    GROUP BY d
    ORDER BY d
  `);

  return { ...r.rows[0], serie_7_dias: serie.rows };
}

export async function listarUsuarios() {
  const r = await pool.query(`
    SELECT u.id, u.nome, u.email, u.role, u.criado_em,
           COUNT(s.id)::int AS total_sensores
    FROM usuarios u
    LEFT JOIN sensores s ON s.usuario_id = u.id
    GROUP BY u.id
    ORDER BY u.id
  `);
  return r.rows;
}

export async function contarAdmins(): Promise<number> {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS total FROM usuarios WHERE role = 'admin'"
  );
  return r.rows[0].total;
}

export async function buscarUsuario(id: number) {
  const r = await pool.query(
    "SELECT id, nome, email, role FROM usuarios WHERE id = $1",
    [id]
  );
  return r.rows[0] ?? null;
}

export async function alterarPapel(id: number, papel: Papel) {
  const r = await pool.query(
    `UPDATE usuarios SET role = $2 WHERE id = $1
     RETURNING id, nome, email, role`,
    [id, papel]
  );
  return r.rows[0] ?? null;
}

export async function excluirUsuario(id: number): Promise<boolean> {
  const r = await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function listarSensoresAdmin() {
  const r = await pool.query(`
    SELECT s.id, s.nome, s.tipo, s.ambiente, s.status, s.valor_atual,
           s.unidade, s.ultima_atividade, s.criado_em,
           s.usuario_id, u.nome AS usuario_nome
    FROM sensores s
    LEFT JOIN usuarios u ON u.id = s.usuario_id
    ORDER BY s.id
  `);
  return r.rows;
}

export async function alterarStatusSensor(id: number, status: string) {
  const r = await pool.query(
    `UPDATE sensores SET status = $2 WHERE id = $1
     RETURNING id, nome, status`,
    [id, status]
  );
  return r.rows[0] ?? null;
}

// Monta o WHERE com parâmetros ($1, $2...) — nunca concatena valores do usuário.
function montarFiltro(f: Pick<FiltroEventos, "suspeito" | "de" | "ate">) {
  const condicoes: string[] = [];
  const valores: unknown[] = [];

  if (f.suspeito !== undefined) {
    valores.push(f.suspeito);
    condicoes.push(`e.suspeito = $${valores.length}`);
  }
  if (f.de) {
    valores.push(f.de);
    condicoes.push(`e.criado_em >= $${valores.length}::date`);
  }
  if (f.ate) {
    valores.push(f.ate);
    condicoes.push(`e.criado_em < ($${valores.length}::date + INTERVAL '1 day')`);
  }

  return {
    where: condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "",
    valores,
  };
}

export async function listarEventos(f: FiltroEventos) {
  const { where, valores } = montarFiltro(f);

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total FROM eventos e ${where}`,
    valores
  );

  const lista = await pool.query(
    `SELECT e.id, e.tipo, e.descricao, e.gravidade, e.suspeito, e.confianca,
            e.criado_em, e.usuario_id, e.sensor_id, u.nome AS usuario_nome
     FROM eventos e
     LEFT JOIN usuarios u ON u.id = e.usuario_id
     ${where}
     ORDER BY e.criado_em DESC, e.id DESC
     LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, f.limite, f.deslocamento]
  );

  return { total: total.rows[0].total as number, eventos: lista.rows };
}

// Dados completos para exportação (sem paginação, teto de 5000 linhas)
export async function dadosRelatorio(
  tipo: "eventos" | "sensores" | "usuarios",
  f: Pick<FiltroEventos, "suspeito" | "de" | "ate">
) {
  if (tipo === "usuarios") {
    return (
      await pool.query(
        `SELECT id, nome, email, role AS papel, criado_em
         FROM usuarios ORDER BY id`
      )
    ).rows;
  }
  if (tipo === "sensores") {
    return (
      await pool.query(
        `SELECT id, nome, tipo, ambiente, status, valor_atual, unidade,
                ultima_atividade, criado_em
         FROM sensores ORDER BY id`
      )
    ).rows;
  }
  const { where, valores } = montarFiltro(f);
  return (
    await pool.query(
      `SELECT e.id, e.criado_em, e.tipo, e.descricao, e.gravidade,
              e.suspeito, e.confianca
       FROM eventos e ${where}
       ORDER BY e.criado_em DESC, e.id DESC LIMIT 5000`,
      valores
    )
  ).rows;
}

// Cada usuário é tratado como uma residência (o projeto não tem tabela própria)
export async function listarResidencias() {
  const r = await pool.query(`
    SELECT u.id AS usuario_id, u.nome AS responsavel, u.email,
           COUNT(s.id)::int AS sensores,
           (COUNT(s.id) FILTER (WHERE s.status = 'ativo'))::int AS sensores_ativos,
           (SELECT COUNT(*) FROM eventos e WHERE e.usuario_id = u.id)::int AS eventos,
           (SELECT COUNT(*) FROM eventos e
             WHERE e.usuario_id = u.id AND e.suspeito = TRUE)::int AS suspeitos,
           GREATEST(
             MAX(s.ultima_atividade),
             (SELECT MAX(e.criado_em) FROM eventos e WHERE e.usuario_id = u.id)
           ) AS ultima_atividade
    FROM usuarios u
    LEFT JOIN sensores s ON s.usuario_id = u.id
    GROUP BY u.id
    ORDER BY u.id
  `);
  return r.rows;
}

export async function obterSeguranca() {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM eventos
        WHERE suspeito = TRUE AND criado_em >= NOW() - INTERVAL '24 hours')::int AS suspeitos_24h,
      (SELECT COUNT(*) FROM eventos
        WHERE suspeito = TRUE AND criado_em >= NOW() - INTERVAL '7 days')::int   AS suspeitos_7d,
      (SELECT COUNT(*) FROM eventos
        WHERE confianca IS NOT NULL
          AND (confianca < 0.7 OR (confianca > 1 AND confianca < 70)))::int      AS baixa_confianca,
      (SELECT COUNT(*) FROM sensores WHERE status <> 'ativo')::int               AS sensores_fora,
      (SELECT COUNT(*) FROM sensores WHERE usuario_id IS NULL)::int              AS sensores_sem_dono,
      (SELECT COUNT(*) FROM usuarios u
        WHERE NOT EXISTS (SELECT 1 FROM sensores s WHERE s.usuario_id = u.id))::int AS usuarios_sem_sensor
  `);

  const admins = await pool.query(
    "SELECT id, nome, email FROM usuarios WHERE role = 'admin' ORDER BY id"
  );

  return { ...r.rows[0], administradores: admins.rows };
}

// Auditoria: nunca deve derrubar a ação principal, por isso engole erros
export async function registrarAuditoria(
  adminId: number | string,
  acao: string,
  alvo: string,
  detalhe: string
) {
  try {
    await pool.query(
      `INSERT INTO auditoria (admin_id, admin_nome, acao, alvo, detalhe)
       SELECT id, nome, $2::text, $3::text, $4::text FROM usuarios WHERE id = $1`,
      [adminId, acao, alvo, detalhe]
    );
  } catch (error) {
    console.error("Falha ao registrar auditoria (rodou 003_auditoria.sql?):", error);
  }
}

export async function listarAuditoria(limite = 15) {
  try {
    const r = await pool.query(
      `SELECT id, admin_nome, acao, alvo, detalhe, criado_em
       FROM auditoria ORDER BY criado_em DESC, id DESC LIMIT $1`,
      [limite]
    );
    return r.rows;
  } catch {
    return []; // tabela ainda não criada
  }
}
