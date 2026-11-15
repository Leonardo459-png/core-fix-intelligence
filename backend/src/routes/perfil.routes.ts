import { Router, Request, Response } from "express";
import { autenticarToken } from "../middlewares/auth.middleware";
import {
  obterPerfil,
  atualizarPerfil,
  trocarSenha,
  atualizarResidencia,
  atualizarFoto,
  obterResumo,
  obterAtividadeSemanal,
} from "../services/perfil.service";

const router = Router();

/**
 * @swagger
 * /api/perfil:
 *   get:
 *     summary: Dados do usuário logado (nome, e-mail, papel, gênero, nascimento)
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *       401:
 *         description: Token ausente ou inválido
 */
router.get("/", autenticarToken, async (_req: Request, res: Response) => {
  try {
    const usuario = await obterPerfil(res.locals.usuario.id);

    if (!usuario) {
      return res.status(401).json({ erro: "Usuário não encontrado." });
    }

    return res.json({ usuario });
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    return res.status(500).json({ erro: "Não foi possível carregar o perfil." });
  }
});

/**
 * @swagger
 * /api/perfil:
 *   put:
 *     summary: Atualiza nome, gênero e data de nascimento do próprio usuário
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome:
 *                 type: string
 *               genero:
 *                 type: string
 *                 enum: [feminino, masculino, outro, nao_informar]
 *               data_nascimento:
 *                 type: string
 *                 example: 2000-05-20
 *     responses:
 *       200:
 *         description: Perfil atualizado
 *       400:
 *         description: Dados inválidos
 */
router.put("/", autenticarToken, async (req: Request, res: Response) => {
  const { nome, genero, data_nascimento } = req.body ?? {};

  if (
    typeof nome !== "string" ||
    (genero != null && typeof genero !== "string") ||
    (data_nascimento != null && typeof data_nascimento !== "string")
  ) {
    return res.status(400).json({ erro: "Dados do perfil inválidos." });
  }

  try {
    const usuario = await atualizarPerfil(res.locals.usuario.id, {
      nome,
      genero,
      data_nascimento,
    });

    return res.json({ mensagem: "Perfil atualizado.", usuario });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "";

    if (
      mensagem.includes("nome") ||
      mensagem.includes("gênero") ||
      mensagem.includes("data de nascimento") ||
      mensagem.includes("anos ou mais")
    ) {
      return res.status(400).json({ erro: mensagem });
    }

    console.error("Erro ao atualizar perfil:", error);
    return res.status(500).json({ erro: "Não foi possível atualizar o perfil." });
  }
});

/**
 * @swagger
 * /api/perfil/senha:
 *   put:
 *     summary: Troca a senha do usuário logado
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [senha_atual, nova_senha]
 *             properties:
 *               senha_atual:
 *                 type: string
 *               nova_senha:
 *                 type: string
 *     responses:
 *       200:
 *         description: Senha alterada
 *       400:
 *         description: Dados inválidos ou senha atual incorreta
 */
router.put("/senha", autenticarToken, async (req: Request, res: Response) => {
  const { senha_atual, nova_senha } = req.body ?? {};

  if (typeof senha_atual !== "string" || typeof nova_senha !== "string") {
    return res.status(400).json({ erro: "Informe a senha atual e a nova senha." });
  }

  try {
    await trocarSenha(res.locals.usuario.id, senha_atual, nova_senha);
    return res.json({ mensagem: "Senha alterada com sucesso." });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "";

    if (
      mensagem.includes("senha") ||
      mensagem.includes("login social")
    ) {
      return res.status(400).json({ erro: mensagem });
    }

    console.error("Erro ao trocar senha:", error);
    return res.status(500).json({ erro: "Não foi possível alterar a senha." });
  }
});

/**
 * @swagger
 * /api/perfil/residencia:
 *   put:
 *     summary: Atualiza os dados da residência do usuário
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apelido: { type: string, example: Casa da praia }
 *               cidade: { type: string, example: Curitiba }
 *               tipo: { type: string, enum: [casa, apartamento] }
 *               moradores: { type: integer, minimum: 1, maximum: 20 }
 *     responses:
 *       200:
 *         description: Residência atualizada
 *       400:
 *         description: Dados inválidos
 */
router.put("/residencia", autenticarToken, async (req: Request, res: Response) => {
  const { apelido, cidade, tipo, moradores } = req.body ?? {};

  try {
    const usuario = await atualizarResidencia(res.locals.usuario.id, {
      apelido,
      cidade,
      tipo,
      moradores,
    });

    return res.json({ mensagem: "Residência atualizada.", usuario });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "";

    if (
      mensagem.includes("residência") ||
      mensagem.includes("cidade") ||
      mensagem.includes("moradores")
    ) {
      return res.status(400).json({ erro: mensagem });
    }

    console.error("Erro ao atualizar residência:", error);
    return res.status(500).json({ erro: "Não foi possível salvar a residência." });
  }
});

/**
 * @swagger
 * /api/perfil/foto:
 *   put:
 *     summary: Define a foto de perfil (data URL jpeg/png/webp)
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               foto: { type: string, example: "data:image/jpeg;base64,..." }
 *     responses:
 *       200:
 *         description: Foto atualizada
 *       400:
 *         description: Imagem inválida
 *   delete:
 *     summary: Remove a foto de perfil
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Foto removida
 */
router.put("/foto", autenticarToken, async (req: Request, res: Response) => {
  try {
    const usuario = await atualizarFoto(res.locals.usuario.id, req.body?.foto ?? "");
    return res.json({ mensagem: "Foto atualizada.", usuario });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "";

    if (mensagem.startsWith("Foto")) {
      return res.status(400).json({ erro: mensagem });
    }

    console.error("Erro ao atualizar foto:", error);
    return res.status(500).json({ erro: "Não foi possível salvar a foto." });
  }
});

router.delete("/foto", autenticarToken, async (_req: Request, res: Response) => {
  try {
    const usuario = await atualizarFoto(res.locals.usuario.id, null);
    return res.json({ mensagem: "Foto removida.", usuario });
  } catch (error) {
    console.error("Erro ao remover foto:", error);
    return res.status(500).json({ erro: "Não foi possível remover a foto." });
  }
});

/**
 * @swagger
 * /api/perfil/resumo:
 *   get:
 *     summary: Resumo da atividade do usuário (sensores, eventos e alertas)
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Números do próprio usuário
 */
router.get("/resumo", autenticarToken, async (_req: Request, res: Response) => {
  try {
    return res.json(await obterResumo(res.locals.usuario.id));
  } catch (error) {
    console.error("Erro ao montar o resumo:", error);
    return res.status(500).json({ erro: "Não foi possível carregar o resumo." });
  }
});

/**
 * @swagger
 * /api/perfil/atividade:
 *   get:
 *     summary: Análises do usuário por dia nos últimos 7 dias
 *     tags: [Perfil]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista com 7 itens (dia, total e suspeitos)
 */
router.get("/atividade", autenticarToken, async (_req: Request, res: Response) => {
  try {
    return res.json(await obterAtividadeSemanal(res.locals.usuario.id));
  } catch (error) {
    console.error("Erro ao montar a atividade semanal:", error);
    return res.status(500).json({ erro: "Não foi possível carregar a atividade." });
  }
});

export default router;
