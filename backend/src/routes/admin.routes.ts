import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.middleware";
import { exigirAdmin } from "../middlewares/admin.middleware";
import {
  resumo,
  usuarios,
  mudarPapel,
  removerUsuario,
  sensores,
  mudarStatusSensor,
  eventos,
  relatorio,
  residencias,
  seguranca,
} from "../controllers/admin.controller";

const router = Router();

// Todas as rotas abaixo exigem login E papel de administrador
router.use(autenticarToken, exigirAdmin);

/**
 * @swagger
 * /api/admin/resumo:
 *   get:
 *     summary: Indicadores gerais do painel administrativo
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Totais de usuários, sensores e eventos
 *       401:
 *         description: Token ausente ou inválido
 *       403:
 *         description: Acesso restrito a administradores
 */
router.get("/resumo", resumo);

/**
 * @swagger
 * /api/admin/usuarios:
 *   get:
 *     summary: Lista todos os usuários com seus papéis
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários
 *       403:
 *         description: Acesso restrito a administradores
 */
router.get("/usuarios", usuarios);

/**
 * @swagger
 * /api/admin/usuarios/{id}/papel:
 *   put:
 *     summary: Altera o papel (permissão) de um usuário
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [papel]
 *             properties:
 *               papel:
 *                 type: string
 *                 enum: [usuario, admin]
 *     responses:
 *       200:
 *         description: Papel alterado
 *       409:
 *         description: Não é possível rebaixar o único administrador
 */
router.put("/usuarios/:id/papel", mudarPapel);

/**
 * @swagger
 * /api/admin/usuarios/{id}:
 *   delete:
 *     summary: Exclui um usuário
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Usuário excluído
 *       409:
 *         description: Própria conta, único admin ou dados vinculados
 */
router.delete("/usuarios/:id", removerUsuario);

/**
 * @swagger
 * /api/admin/sensores:
 *   get:
 *     summary: Lista os sensores de todos os usuários
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de sensores com o nome do dono
 */
router.get("/sensores", sensores);

/**
 * @swagger
 * /api/admin/sensores/{id}/status:
 *   put:
 *     summary: Ativa, desativa ou coloca um sensor em manutenção
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ativo, inativo, manutencao]
 *     responses:
 *       200:
 *         description: Status alterado
 *       404:
 *         description: Sensor não encontrado
 */
router.put("/sensores/:id/status", mudarStatusSensor);

/**
 * @swagger
 * /api/admin/eventos:
 *   get:
 *     summary: Alertas e histórico de eventos (paginado, com filtros)
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: suspeito
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: de
 *         schema:
 *           type: string
 *           example: 2026-11-01
 *       - in: query
 *         name: ate
 *         schema:
 *           type: string
 *           example: 2026-11-30
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Eventos e total
 */
router.get("/eventos", eventos);

/**
 * @swagger
 * /api/admin/relatorio:
 *   get:
 *     summary: Exporta relatório em CSV (eventos, sensores ou usuários)
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         required: true
 *         schema:
 *           type: string
 *           enum: [eventos, sensores, usuarios]
 *       - in: query
 *         name: suspeito
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: de
 *         schema:
 *           type: string
 *       - in: query
 *         name: ate
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Arquivo CSV
 */
router.get("/relatorio", relatorio);

/**
 * @swagger
 * /api/admin/residencias:
 *   get:
 *     summary: Residências (uma por usuário) com sensores, eventos e suspeitos
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de residências
 */
router.get("/residencias", residencias);

/**
 * @swagger
 * /api/admin/seguranca:
 *   get:
 *     summary: Indicadores de segurança e registro de auditoria
 *     tags: [Administração]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Indicadores, administradores e últimas ações
 */
router.get("/seguranca", seguranca);

export default router;
