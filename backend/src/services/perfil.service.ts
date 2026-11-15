import bcrypt from "bcryptjs";
import { pool } from "../database";
import {
  GENEROS,
  IDADE_MINIMA,
  lerData,
  calcularIdade,
} from "./auth.service";

const COLUNAS = `id, nome, email, role AS papel, genero,
  to_char(data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
  criado_em, login_social,
  residencia_apelido, residencia_cidade, residencia_tipo, residencia_moradores,
  foto`;

export async function obterPerfil(id: number) {
  const r = await pool.query(`SELECT ${COLUNAS} FROM usuarios WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

interface DadosPerfil {
  nome: string;
  genero?: string | null;
  data_nascimento?: string | null;
}

export async function atualizarPerfil(id: number, dados: DadosPerfil) {
  const nome = dados.nome.trim();

  if (nome.length < 2 || nome.length > 100) {
    throw new Error("Informe um nome entre 2 e 100 caracteres.");
  }

  // Texto vazio apaga o dado (a pessoa pode remover gênero e nascimento quando quiser)
  let genero: string | null = null;
  if (dados.genero) {
    if (!GENEROS.includes(dados.genero)) {
      throw new Error("Selecione uma opção de gênero válida.");
    }
    genero = dados.genero;
  }

  let dataNascimento: string | null = null;
  if (dados.data_nascimento) {
    const nascimento = lerData(dados.data_nascimento);

    if (!nascimento) {
      throw new Error("Informe uma data de nascimento válida.");
    }
    if (nascimento.getTime() > Date.now()) {
      throw new Error("A data de nascimento não pode estar no futuro.");
    }
    if (calcularIdade(nascimento) < IDADE_MINIMA) {
      throw new Error(`É necessário ter ${IDADE_MINIMA} anos ou mais.`);
    }
    dataNascimento = dados.data_nascimento;
  }

  const r = await pool.query(
    `UPDATE usuarios SET nome = $1, genero = $2, data_nascimento = $3
     WHERE id = $4
     RETURNING ${COLUNAS}`,
    [nome, genero, dataNascimento, id]
  );

  return r.rows[0] ?? null;
}

export async function trocarSenha(id: number, senhaAtual: string, novaSenha: string) {
  if (novaSenha.length < 8) {
    throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
  }

  const r = await pool.query(
    "SELECT senha_hash, login_social FROM usuarios WHERE id = $1",
    [id]
  );
  const usuario = r.rows[0];

  if (!usuario) throw new Error("Usuário não encontrado.");

  if (usuario.login_social) {
    throw new Error("Sua conta usa login social e não tem senha própria.");
  }

  if (!(await bcrypt.compare(senhaAtual, usuario.senha_hash))) {
    throw new Error("A senha atual está incorreta.");
  }

  if (senhaAtual === novaSenha) {
    throw new Error("A nova senha deve ser diferente da atual.");
  }

  await pool.query("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [
    await bcrypt.hash(novaSenha, 12),
    id,
  ]);
}

// ===== Minha residência =====

const TIPOS_RESIDENCIA = ["casa", "apartamento"];

interface DadosResidencia {
  apelido?: string | null;
  cidade?: string | null;
  tipo?: string | null;
  moradores?: number | string | null;
}

export async function atualizarResidencia(id: number, dados: DadosResidencia) {
  const apelido = (dados.apelido ?? "").trim();
  const cidade = (dados.cidade ?? "").trim();
  const tipo = dados.tipo || null;

  if (apelido.length > 60) {
    throw new Error("O apelido da residência deve ter até 60 caracteres.");
  }
  if (cidade.length > 60) {
    throw new Error("A cidade deve ter até 60 caracteres.");
  }
  if (tipo !== null && !TIPOS_RESIDENCIA.includes(tipo)) {
    throw new Error("Selecione um tipo de residência válido.");
  }

  let moradores: number | null = null;
  if (dados.moradores !== null && dados.moradores !== undefined && dados.moradores !== "") {
    moradores = Number(dados.moradores);

    if (!Number.isInteger(moradores) || moradores < 1 || moradores > 20) {
      throw new Error("O número de moradores deve ser de 1 a 20.");
    }
  }

  const r = await pool.query(
    `UPDATE usuarios
     SET residencia_apelido = $1, residencia_cidade = $2,
         residencia_tipo = $3, residencia_moradores = $4
     WHERE id = $5
     RETURNING ${COLUNAS}`,
    [apelido || null, cidade || null, tipo, moradores, id]
  );

  return r.rows[0] ?? null;
}

// ===== Foto de perfil =====

// A tela reduz a imagem para 256x256 (JPEG) antes de enviar; aqui validamos de novo
const FOTO_REGEX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const FOTO_MAX_CHARS = 300_000; // ~220 KB de imagem

export async function atualizarFoto(id: number, foto: string | null) {
  if (foto !== null) {
    if (typeof foto !== "string" || !FOTO_REGEX.test(foto)) {
      throw new Error("Foto inválida. Envie uma imagem JPG, PNG ou WebP.");
    }
    if (foto.length > FOTO_MAX_CHARS) {
      throw new Error("Foto muito grande. Escolha uma imagem menor.");
    }
  }

  const r = await pool.query(
    `UPDATE usuarios SET foto = $1 WHERE id = $2 RETURNING ${COLUNAS}`,
    [foto, id]
  );

  return r.rows[0] ?? null;
}

// ===== Resumo da atividade =====

export async function obterResumo(id: number) {
  const sensores = await pool.query(
    `SELECT COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE status = 'ativo'))::int AS ativos
     FROM sensores WHERE usuario_id = $1`,
    [id]
  );

  const eventos = await pool.query(
    `SELECT COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE suspeito = TRUE))::int AS suspeitos,
            MAX(criado_em) AS ultima_analise
     FROM eventos WHERE usuario_id = $1`,
    [id]
  );

  return {
    sensores: sensores.rows[0].total as number,
    sensores_ativos: sensores.rows[0].ativos as number,
    eventos: eventos.rows[0].total as number,
    alertas: eventos.rows[0].suspeitos as number,
    ultima_analise: eventos.rows[0].ultima_analise as string | null,
  };
}

// ===== Atividade dos últimos 7 dias (gráfico da visão geral) =====

export async function obterAtividadeSemanal(id: number) {
  const r = await pool.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS dia,
            COUNT(e.id)::int AS total,
            (COUNT(e.id) FILTER (WHERE e.suspeito = TRUE))::int AS suspeitos
     FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') AS d
     LEFT JOIN eventos e
       ON e.usuario_id = $1 AND e.criado_em::date = d::date
     GROUP BY d
     ORDER BY d`,
    [id]
  );

  return r.rows as { dia: string; total: number; suspeitos: number }[];
}
