import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.middleware";
import {
  definirDonoNoCorpo,
  exigirDonoDoSensor,
} from "../middlewares/sensor.middleware";

import {
  listarSensores,
  consultarSensor,
  cadastrarSensor,
  atualizarSensor,
  excluirSensor,
} from "../controllers/sensor.controller";

const router = Router();

// Todas as rotas de sensores exigem login (token JWT)
router.use(autenticarToken);

/**
 * @swagger
 * /api/sensores:
 *   get:
 *     summary: Lista todos os sensores cadastrados
 *     tags: [Sensores]
 *     responses:
 *       200:
 *         description: Lista de sensores
 *       500:
 *         description: Erro ao listar sensores
 */
router.get("/", listarSensores);

/**
 * @swagger
 * /api/sensores/{id}:
 *   get:
 *     summary: Consulta um sensor pelo ID
 *     tags: [Sensores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Sensor encontrado
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Sensor não encontrado
 *       500:
 *         description: Erro ao consultar sensor
 */
router.get("/:id", exigirDonoDoSensor, consultarSensor);

/**
 * @swagger
 * /api/sensores:
 *   post:
 *     summary: Cadastra um novo sensor
 *     tags: [Sensores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - tipo
 *             properties:
 *               usuario_id:
 *                 type: integer
 *                 nullable: true
 *                 example: 1
 *               nome:
 *                 type: string
 *                 example: Sensor de movimento da sala
 *               tipo:
 *                 type: string
 *                 example: movimento
 *               ambiente:
 *                 type: string
 *                 example: Sala
 *               status:
 *                 type: string
 *                 example: ativo
 *               valor_atual:
 *                 type: number
 *                 nullable: true
 *                 example: 1
 *               unidade:
 *                 type: string
 *                 nullable: true
 *                 example: estado
 *     responses:
 *       201:
 *         description: Sensor cadastrado com sucesso
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro ao cadastrar sensor
 */
router.post("/", definirDonoNoCorpo, cadastrarSensor);

/**
 * @swagger
 * /api/sensores/{id}:
 *   put:
 *     summary: Atualiza os dados de um sensor
 *     tags: [Sensores]
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
 *             properties:
 *               nome:
 *                 type: string
 *               tipo:
 *                 type: string
 *               ambiente:
 *                 type: string
 *               status:
 *                 type: string
 *               valor_atual:
 *                 type: number
 *                 nullable: true
 *               unidade:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Sensor atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Sensor não encontrado
 *       500:
 *         description: Erro ao atualizar sensor
 */
router.put("/:id", exigirDonoDoSensor, atualizarSensor);

/**
 * @swagger
 * /api/sensores/{id}:
 *   delete:
 *     summary: Exclui um sensor pelo ID
 *     tags: [Sensores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Sensor excluído com sucesso
 *       400:
 *         description: ID inválido
 *       404:
 *         description: Sensor não encontrado
 *       500:
 *         description: Erro ao excluir sensor
 */
router.delete("/:id", exigirDonoDoSensor, excluirSensor);

export default router;
