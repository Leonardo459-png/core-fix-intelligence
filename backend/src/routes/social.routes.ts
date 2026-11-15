import { Router, Request, Response } from "express";
import {
  entrarComGoogle,
  entrarComGithub,
  githubConfigurado,
  criarEstadoGithub,
  estadoGithubValido,
  urlAutorizacaoGithub,
} from "../services/social.service";

const router = Router();

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Login ou cadastro com conta Google
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credential
 *             properties:
 *               credential:
 *                 type: string
 *                 description: ID token entregue pelo Google ao front-end
 *     responses:
 *       200:
 *         description: Login realizado (usuário e token JWT)
 *       401:
 *         description: Credencial do Google inválida
 *       503:
 *         description: Login com Google não configurado no servidor
 */
router.post("/google", async (req: Request, res: Response) => {
  try {
    const credencial = req.body?.credential;

    if (typeof credencial !== "string" || !credencial) {
      return res.status(400).json({ erro: "Credencial do Google ausente." });
    }

    const resultado = await entrarComGoogle(credencial);

    return res.status(200).json({
      mensagem: "Login realizado com sucesso.",
      ...resultado,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "";

    if (mensagem === "Login com Google não configurado.") {
      return res.status(503).json({ erro: mensagem });
    }

    if (
      mensagem.includes("Credencial do Google") ||
      mensagem.includes("E-mail do Google")
    ) {
      return res.status(401).json({ erro: mensagem });
    }

    console.error("Erro no login com Google:", error);
    return res.status(500).json({ erro: "Não foi possível entrar com o Google." });
  }
});

const COOKIE_GITHUB = "corefix_gh_state";

function lerCookie(req: Request, nome: string): string | undefined {
  const partes = (req.headers.cookie || "").split(";");
  for (const parte of partes) {
    const [chave, ...valor] = parte.trim().split("=");
    if (chave === nome) return valor.join("=");
  }
  return undefined;
}

function voltarAoFront(res: Response, fragmento: string) {
  const front = process.env.FRONTEND_URL || "http://localhost:5173";
  // O token vai no fragmento (#...), que o navegador não envia a servidores nem registra em logs
  return res.redirect(`${front}/#${fragmento}`);
}

/**
 * @swagger
 * /api/auth/github:
 *   get:
 *     summary: Inicia o login com GitHub (redireciona para o GitHub)
 *     tags: [Autenticação]
 *     responses:
 *       302:
 *         description: Redireciona para a tela de autorização do GitHub
 */
router.get("/github", (_req: Request, res: Response) => {
  if (!githubConfigurado()) {
    return voltarAoFront(
      res,
      `github_erro=${encodeURIComponent("Login com GitHub ainda não configurado.")}`
    );
  }

  const { nonce, state } = criarEstadoGithub();

  res.cookie(COOKIE_GITHUB, nonce, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  return res.redirect(urlAutorizacaoGithub(state));
});

/**
 * @swagger
 * /api/auth/github/callback:
 *   get:
 *     summary: Retorno do GitHub; conclui o login e volta para o sistema
 *     tags: [Autenticação]
 *     responses:
 *       302:
 *         description: Redireciona ao front-end com a sessão (ou com o erro)
 */
router.get("/github/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const nonceCookie = lerCookie(req, COOKIE_GITHUB);

  res.clearCookie(COOKIE_GITHUB);

  if (error === "access_denied") {
    return voltarAoFront(
      res,
      `github_erro=${encodeURIComponent("Você cancelou o login com GitHub.")}`
    );
  }

  if (
    typeof code !== "string" ||
    typeof state !== "string" ||
    !estadoGithubValido(state, nonceCookie)
  ) {
    return voltarAoFront(
      res,
      `github_erro=${encodeURIComponent("Sessão de login inválida. Tente novamente.")}`
    );
  }

  try {
    const { token } = await entrarComGithub(code);
    return voltarAoFront(res, `github_token=${encodeURIComponent(token)}`);
  } catch (erro) {
    const mensagem =
      erro instanceof Error && erro.message.includes("GitHub")
        ? erro.message
        : "Não foi possível entrar com o GitHub.";

    if (!(erro instanceof Error) || !erro.message.includes("GitHub")) {
      console.error("Erro no login com GitHub:", erro);
    }

    return voltarAoFront(res, `github_erro=${encodeURIComponent(mensagem)}`);
  }
});

export default router;
