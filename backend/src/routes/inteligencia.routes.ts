import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.middleware";

import {
  analisarEvento,
  chatbot,
} from "../controllers/inteligencia.controller";

const router = Router();

/**
 * @swagger
 * /api/analisar-evento:
 *   post:
 *     summary: Analisa um evento usando Machine Learning e salva o resultado
 *     tags: [Machine Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hora
 *               - movimento
 *               - porta_aberta
 *               - consumo_energia
 *               - presenca_morador
 *             properties:
 *               hora:
 *                 type: integer
 *                 example: 23
 *               movimento:
 *                 type: integer
 *                 example: 1
 *               porta_aberta:
 *                 type: integer
 *                 example: 1
 *               consumo_energia:
 *                 type: number
 *                 example: 80
 *               presenca_morador:
 *                 type: integer
 *                 example: 0
 *     responses:
 *       200:
 *         description: Evento analisado e salvo no banco de dados
 *       503:
 *         description: Não foi possível realizar a análise
 */
router.post("/analisar-evento", autenticarToken, analisarEvento);

/**
 * @swagger
 * /api/chatbot:
 *   post:
 *     summary: Envia uma pergunta ao ChatBot inteligente
 *     security:
 *       - BearerAuth: []
 *     description: O serviço interpreta a mensagem e pode consultar sensores, consumo, alertas ou analisar eventos.
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pergunta
 *             properties:
 *               pergunta:
 *                 type: string
 *                 example: "Quantos sensores estão ativos?"
 *     responses:
 *       200:
 *         description: Mensagem processada pelo ChatBot
 *       400:
 *         description: Pergunta não informada
 *       503:
 *         description: Não foi possível processar a mensagem
 */
router.post("/chatbot", autenticarToken, chatbot);

export default router;
