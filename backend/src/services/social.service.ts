import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../database";
import { enviarEmailBoasVindas } from "./email.service";

// Valida o "ID token" que o Google entrega ao front e devolve o MESMO tipo de
// sessão do login por e-mail e senha (usuário + token JWT do próprio sistema).
// A validação usa o endpoint oficial do Google (tokeninfo), sem biblioteca extra.
export async function entrarComGoogle(credencial: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new Error("Login com Google não configurado.");
  }

  const resposta = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credencial)}`
  );

  if (!resposta.ok) {
    throw new Error("Credencial do Google inválida.");
  }

  const dados = (await resposta.json()) as {
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
  };

  // O token precisa ter sido emitido para ESTE aplicativo e com e-mail verificado
  if (dados.aud !== clientId) {
    throw new Error("Credencial do Google inválida.");
  }

  if (
    !dados.email ||
    (dados.email_verified !== true && dados.email_verified !== "true")
  ) {
    throw new Error("E-mail do Google não verificado.");
  }

  return sessaoParaEmail(dados.email, dados.name);
}

// Cria a conta no primeiro acesso (ou reaproveita a existente) e devolve a MESMA
// sessão do login por e-mail e senha. Só deve receber e-mails que o provedor
// (Google/GitHub) já confirmou, por isso a conta fica marcada como verificada.
async function sessaoParaEmail(emailBruto: string, nomeBruto?: string) {
  const email = emailBruto.trim().toLowerCase();
  const nome = (nomeBruto?.trim() || email.split("@")[0]).slice(0, 100);

  let resultado = await pool.query(
    "SELECT id, nome, email FROM usuarios WHERE email = $1",
    [email]
  );

  // Primeiro acesso: cria a conta. A senha é aleatória (a pessoa entra pelo provedor).
  if (resultado.rows.length === 0) {
    const senhaHash = await bcrypt.hash(
      crypto.randomBytes(32).toString("hex"),
      12
    );

    resultado = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, email_verificado, login_social)
       VALUES ($1, $2, $3, TRUE, TRUE)
       RETURNING id, nome, email`,
      [nome, email, senhaHash]
    );

    // Conta nova: manda o e-mail de boas-vindas (sem travar o login se o envio falhar)
    enviarEmailBoasVindas({ para: email, nome }).catch((error) =>
      console.error("Falha ao enviar e-mail de boas-vindas:", error)
    );
  } else {
    // O provedor provou que a pessoa é dona do e-mail
    await pool.query(
      "UPDATE usuarios SET email_verificado = TRUE WHERE id = $1 AND email_verificado = FALSE",
      [resultado.rows[0].id]
    );
  }

  const usuario = resultado.rows[0];

  const chave = process.env.JWT_SECRET;
  if (!chave) {
    throw new Error("JWT_SECRET não configurada.");
  }

  const token = jwt.sign({ id: usuario.id, email: usuario.email }, chave, {
    expiresIn: "8h",
  });

  return { usuario, token };
}

// ===== GitHub (OAuth 2.0, fluxo "authorization code") =====

const GITHUB_UA = "corefix-intelligence";

export function githubConfigurado(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

function chaveJwt(): string {
  const chave = process.env.JWT_SECRET;
  if (!chave) throw new Error("JWT_SECRET não configurada.");
  return chave;
}

// "state" assinado + cookie com o mesmo valor: impede que alguém injete um login alheio (CSRF)
export function criarEstadoGithub() {
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = jwt.sign({ nonce }, chaveJwt(), { expiresIn: "10m" });
  return { nonce, state };
}

export function estadoGithubValido(state: string, nonceCookie: string | undefined): boolean {
  try {
    const dados = jwt.verify(state, chaveJwt()) as { nonce?: string };
    return Boolean(dados.nonce) && dados.nonce === nonceCookie;
  } catch {
    return false;
  }
}

export function urlAutorizacaoGithub(state: string): string {
  const base = process.env.BACKEND_URL || "http://localhost:3000";
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || "",
    redirect_uri: `${base}/api/auth/github/callback`,
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function entrarComGithub(codigo: string) {
  const respToken = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": GITHUB_UA,
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: codigo,
    }),
  });

  const dadosToken = (await respToken.json()) as { access_token?: string };

  if (!respToken.ok || !dadosToken.access_token) {
    throw new Error("Código do GitHub inválido ou expirado.");
  }

  const cabecalhos = {
    Authorization: `Bearer ${dadosToken.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": GITHUB_UA,
  };

  const [respUsuario, respEmails] = await Promise.all([
    fetch("https://api.github.com/user", { headers: cabecalhos }),
    fetch("https://api.github.com/user/emails", { headers: cabecalhos }),
  ]);

  if (!respUsuario.ok || !respEmails.ok) {
    throw new Error("Não foi possível ler os dados do GitHub.");
  }

  const perfil = (await respUsuario.json()) as { login?: string; name?: string | null };
  const emails = (await respEmails.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;

  // Só aceita e-mail confirmado pelo GitHub, preferindo o principal
  const escolhido =
    emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);

  if (!escolhido) {
    throw new Error("Sua conta do GitHub não tem e-mail verificado.");
  }

  return sessaoParaEmail(escolhido.email, perfil.name || perfil.login);
}
