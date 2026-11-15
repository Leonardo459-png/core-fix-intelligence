import { Router, Request, Response } from "express";
import {
  registrarUsuario,
  autenticarUsuario,
  verificarEmail,
  reenviarVerificacao,
} from "../services/auth.service";

const router = Router();

/**
 * @swagger
 * /api/auth/registrar:
 *   post:
 *     summary: Cadastra um novo usuário
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - email
 *               - senha
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Usuario Teste
 *               email:
 *                 type: string
 *                 example: teste.autenticacao@corefix.com
 *               senha:
 *                 type: string
 *                 example: CoreFix@2026
 *               genero:
 *                 type: string
 *                 enum: [feminino, masculino, outro, nao_informar]
 *                 description: Opcional
 *               data_nascimento:
 *                 type: string
 *                 example: 2000-05-20
 *                 description: Opcional, formato AAAA-MM-DD (mínimo 18 anos)
 *     responses:
 *       201:
 *         description: Usuário cadastrado
 *       400:
 *         description: Dados inválidos ou e-mail já cadastrado
 */
router.post("/registrar", async (req: Request, res: Response) => {
  try {
    const { nome, email, senha, genero, data_nascimento } = req.body ?? {};

    if (
      typeof nome !== "string" ||
      typeof email !== "string" ||
      typeof senha !== "string" ||
      (genero !== undefined && typeof genero !== "string") ||
      (data_nascimento !== undefined && typeof data_nascimento !== "string")
    ) {
      return res.status(400).json({
        erro: "Informe nome, e-mail e senha válidos.",
      });
    }

    const usuario = await registrarUsuario({
      nome,
      email,
      senha,
      genero,
      data_nascimento,
    });

    return res.status(201).json({
      mensagem: "Cadastro realizado. Confirme seu e-mail para entrar.",
      usuario,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "";

    if (
      mensagem.includes("e-mail real") ||
      mensagem.includes("já está cadastrado") ||
      mensagem.includes("Preencha") ||
      mensagem.includes("pelo menos 8") ||
      mensagem.includes("gênero") ||
      mensagem.includes("data de nascimento") ||
      mensagem.includes("anos ou mais")
    ) {
      return res.status(400).json({ erro: mensagem });
    }

    console.error("Erro no cadastro:", error);

    return res.status(500).json({
      erro: "Não foi possível cadastrar o usuário.",
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Realiza login e retorna token JWT
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - senha
 *             properties:
 *               email:
 *                 type: string
 *                 example: teste.autenticacao@corefix.com
 *               senha:
 *                 type: string
 *                 example: CoreFix@2026
 *     responses:
 *       200:
 *         description: Login realizado
 *       401:
 *         description: Credenciais inválidas
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, senha } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof senha !== "string" ||
      !email.trim() ||
      !senha
    ) {
      return res.status(400).json({
        erro: "Informe e-mail e senha.",
      });
    }

    const resultado = await autenticarUsuario({
      email,
      senha,
    });

    return res.status(200).json({
      mensagem: "Login realizado com sucesso.",
      ...resultado,
    });
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "";

    if (mensagem === "E-mail ou senha incorretos.") {
      return res.status(401).json({ erro: mensagem });
    }

    if (mensagem.startsWith("E-mail não verificado")) {
      return res
        .status(403)
        .json({ erro: mensagem, codigo: "EMAIL_NAO_VERIFICADO" });
    }

    console.error("Erro no login:", error);

    return res.status(500).json({
      erro: "Não foi possível realizar o login.",
    });
  }
});

/**
 * @swagger
 * /api/auth/verificar-email:
 *   get:
 *     summary: Confirma o e-mail pelo link recebido e redireciona para o sistema
 *     tags: [Autenticação]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redireciona para o front-end (?verificado=1 ou ?verificado=0)
 */
router.get("/verificar-email", async (req: Request, res: Response) => {
  const front = process.env.FRONTEND_URL || "http://localhost:5173";
  const token = req.query.token;

  try {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error("Link inválido ou expirado.");
    }

    await verificarEmail(token);
    return res.redirect(`${front}/?verificado=1`);
  } catch {
    return res.redirect(`${front}/?verificado=0`);
  }
});

/**
 * @swagger
 * /api/auth/reenviar-verificacao:
 *   post:
 *     summary: Reenvia o e-mail de confirmação (no máximo 1 por minuto)
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Se existir conta pendente, um novo e-mail foi enviado
 *       429:
 *         description: Pedido de reenvio muito rápido
 */
router.post("/reenviar-verificacao", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};

  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ erro: "Informe o e-mail." });
  }

  try {
    await reenviarVerificacao(email);

    return res.status(200).json({
      mensagem: "Se houver um cadastro pendente com esse e-mail, enviamos um novo link.",
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "";

    if (mensagem.startsWith("Aguarde")) {
      return res.status(429).json({ erro: mensagem });
    }

    console.error("Erro ao reenviar verificação:", error);
    return res.status(500).json({ erro: "Não foi possível reenviar o e-mail." });
  }
});

export default router;
