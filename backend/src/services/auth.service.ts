import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../database";
import { promises as dns } from "dns";
import { enviarEmailBoasVindas, enviarEmailVerificacao } from "./email.service";

interface DadosCadastro {
  nome: string;
  email: string;
  senha: string;
  // Opcionais na API (cadastro antigo e login social continuam valendo)
  genero?: string;
  data_nascimento?: string; // formato AAAA-MM-DD
}

export const GENEROS = ["feminino", "masculino", "outro", "nao_informar"];
export const IDADE_MINIMA = 18;
const VALIDADE_TOKEN_HORAS = 24;
const INTERVALO_REENVIO_SEGUNDOS = 60;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Gera um token novo, guarda só o hash no banco e manda o link por e-mail
async function emitirVerificacao(usuario: { id: number; nome: string; email: string }) {
  const token = crypto.randomBytes(32).toString("hex");

  await pool.query(
    `UPDATE usuarios
     SET token_verificacao = $1,
         token_verificacao_expira = NOW() + ($2 || ' hours')::interval
     WHERE id = $3`,
    [hashToken(token), String(VALIDADE_TOKEN_HORAS), usuario.id]
  );

  const base = process.env.BACKEND_URL || "http://localhost:3000";
  const link = `${base}/api/auth/verificar-email?token=${token}`;

  try {
    const { enviado } = await enviarEmailVerificacao({
      para: usuario.email,
      nome: usuario.nome,
      link,
    });
    return enviado;
  } catch (error) {
    // A conta já existe; a pessoa pode pedir o reenvio na tela
    console.error("Falha ao enviar e-mail de verificação:", error);

    // Fora de produção, mostra o link no terminal para o cadastro poder ser concluído mesmo assim
    if (process.env.NODE_ENV !== "production") {
      console.log("\n[Modo de desenvolvimento] Link de verificação para", usuario.email);
      console.log(link, "\n");
    }

    return false;
  }
}

export async function verificarEmail(token: string) {
  const resultado = await pool.query(
    `UPDATE usuarios
     SET email_verificado = TRUE,
         token_verificacao = NULL,
         token_verificacao_expira = NULL
     WHERE token_verificacao = $1
       AND token_verificacao_expira > NOW()
     RETURNING id, nome, email`,
    [hashToken(token)]
  );

  if (resultado.rows.length === 0) {
    throw new Error("Link inválido ou expirado.");
  }

  // E-mail confirmado (acontece uma única vez por conta, pois o token é apagado):
  // agora sim a pessoa recebe as boas-vindas. Falha no envio não impede a confirmação.
  const { nome, email } = resultado.rows[0];
  enviarEmailBoasVindas({ para: email, nome }).catch((error) =>
    console.error("Falha ao enviar e-mail de boas-vindas:", error)
  );
}

// Resposta sempre igual na rota, para não revelar quais e-mails existem
export async function reenviarVerificacao(emailBruto: string) {
  const email = emailBruto.trim().toLowerCase();

  const resultado = await pool.query(
    `SELECT id, nome, email, email_verificado, token_verificacao_expira
     FROM usuarios WHERE email = $1`,
    [email]
  );

  const usuario = resultado.rows[0];
  if (!usuario || usuario.email_verificado) return;

  // Limite simples: no máximo um envio a cada minuto por conta
  if (usuario.token_verificacao_expira) {
    const emitidoEm =
      new Date(usuario.token_verificacao_expira).getTime() -
      VALIDADE_TOKEN_HORAS * 3600 * 1000;

    if (Date.now() - emitidoEm < INTERVALO_REENVIO_SEGUNDOS * 1000) {
      throw new Error("Aguarde um minuto para pedir um novo e-mail.");
    }
  }

  await emitirVerificacao(usuario);
}

// Aceita só AAAA-MM-DD e rejeita datas que não existem (ex.: 2026-02-31)
export function lerData(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;

  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
    ? data
    : null;
}

export function calcularIdade(nascimento: Date, hoje = new Date()): number {
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const jaFezAniversario =
    hoje.getUTCMonth() > nascimento.getUTCMonth() ||
    (hoje.getUTCMonth() === nascimento.getUTCMonth() &&
      hoje.getUTCDate() >= nascimento.getUTCDate());

  if (!jaFezAniversario) idade--;
  return idade;
}

interface DadosLogin {
  email: string;
  senha: string;
}

function obterChaveJWT(): string {
  const chave = process.env.JWT_SECRET;

  if (!chave) {
    throw new Error("JWT_SECRET não configurada.");
  }

  return chave;
}

// Recusa e-mails inventados: formato válido e domínio que realmente recebe mensagens (registro MX/A).
// Se o DNS estiver fora do ar não bloqueamos o cadastro; a confirmação por link continua
// sendo a prova definitiva de que o endereço existe e é da pessoa.
export async function validarEmailReal(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new Error("Informe um e-mail real e válido.");
  }

  const dominio = email.split("@")[1];

  try {
    const mx = await dns.resolveMx(dominio);
    if (mx.length > 0) return;
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code;
    if (codigo !== "ENOTFOUND" && codigo !== "ENODATA") return; // falha de rede: não bloqueia
  }

  try {
    const a = await dns.resolve4(dominio);
    if (a.length > 0) return;
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code;
    if (codigo !== "ENOTFOUND" && codigo !== "ENODATA") return;
  }

  throw new Error(`Informe um e-mail real: o domínio "${dominio}" não existe ou não recebe mensagens.`);
}

export async function registrarUsuario(dados: DadosCadastro) {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();

  if (!nome || !email || !dados.senha) {
    throw new Error("Preencha todos os campos.");
  }

  if (dados.senha.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }

  await validarEmailReal(email);

  let genero: string | null = null;
  let dataNascimento: string | null = null;

  if (dados.genero !== undefined) {
    if (!GENEROS.includes(dados.genero)) {
      throw new Error("Selecione uma opção de gênero válida.");
    }
    genero = dados.genero;
  }

  if (dados.data_nascimento !== undefined) {
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

  const usuarioExistente = await pool.query(
    "SELECT id FROM usuarios WHERE email = $1",
    [email]
  );

  if (usuarioExistente.rows.length > 0) {
    throw new Error("Este e-mail já está cadastrado.");
  }

  const senhaHash = await bcrypt.hash(dados.senha, 12);

  const resultado = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, genero, data_nascimento)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nome, email, genero, data_nascimento, criado_em`,
    [nome, email, senhaHash, genero, dataNascimento]
  );

  const usuario = resultado.rows[0];
  // No cadastro vai só o e-mail de confirmação; as boas-vindas chegam depois que ela confirmar
  const emailEnviado = await emitirVerificacao(usuario);

  return { ...usuario, email_enviado: emailEnviado };
}

export async function autenticarUsuario(dados: DadosLogin) {
  const email = dados.email.trim().toLowerCase();

  const resultado = await pool.query(
    `SELECT id, nome, email, senha_hash, email_verificado
     FROM usuarios
     WHERE email = $1`,
    [email]
  );

  if (resultado.rows.length === 0) {
    throw new Error("E-mail ou senha incorretos.");
  }

  const usuario = resultado.rows[0];

  const senhaValida = await bcrypt.compare(
    dados.senha,
    usuario.senha_hash
  );

  if (!senhaValida) {
    throw new Error("E-mail ou senha incorretos.");
  }

  // Só confirma depois de checar a senha, para não revelar contas pendentes
  if (!usuario.email_verificado) {
    throw new Error("E-mail não verificado. Confirme o link enviado para sua caixa de entrada.");
  }

  const token = jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
    },
    obterChaveJWT(),
    {
      expiresIn: "8h",
    }
  );

  return {
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    },
    token,
  };
}