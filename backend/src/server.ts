import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { testarConexao } from "./database";

import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

import authRoutes from "./routes/auth.routes";
import sensorRoutes from "./routes/sensor.routes";
import inteligenciaRoutes from "./routes/inteligencia.routes";
import adminRoutes from "./routes/admin.routes";
import perfilRoutes from "./routes/perfil.routes";
import socialRoutes from "./routes/social.routes";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const PYTHON_API =
  process.env.PYTHON_API || "http://127.0.0.1:8001";

// ==========================================
// CONFIGURAÇÃO DE SEGURANÇA
// ==========================================

const origensPermitidas = [
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origensPermitidas.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origem não autorizada pelo CORS."));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Limita o tamanho das requisições JSON
app.use(express.json({ limit: "1mb" }));

// ==========================================
// ROTAS DA APLICAÇÃO
// ==========================================

app.use("/api/auth", authRoutes);
app.use("/api/auth", socialRoutes);
app.use("/api/sensores", sensorRoutes);
app.use("/api/perfil", perfilRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", inteligenciaRoutes);

// ==========================================
// DOCUMENTAÇÃO SWAGGER
// ==========================================

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "CORE FIX Intelligence API",
      version: "1.0.0",
      description:
        "API da plataforma inteligente de Smart Home CORE FIX Intelligence.",
    },

    // AUTENTICAÇÃO JWT
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Informe o token JWT obtido no login.",
        },
      },
    },

    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Servidor local",
      },
    ],

    tags: [
      {
        name: "Sistema",
        description: "Status e informações do sistema",
      },
      {
        name: "Autenticação",
        description: "Cadastro e login de usuários",
      },
      {
        name: "Machine Learning",
        description: "Análise inteligente de eventos",
      },
      {
        name: "Chatbot",
        description: "Interação com o assistente inteligente",
      },
      {
        name: "Sensores",
        description: "Gerenciamento dos sensores da residência",
      },
      {
        name: "Administração",
        description: "Área administrativa (somente administradores)",
      },
    ],
  },

  apis: ["./src/**/*.ts"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocs)
);

// ==========================================
// ROTA INICIAL
// ==========================================

/**
 * @swagger
 * /:
 *   get:
 *     summary: Verifica se o backend está funcionando
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Backend online
 */

app.get("/", (_req, res) => {
  res.json({
    sistema: "CORE FIX Intelligence",
    status: "online",
    mensagem: "Backend TypeScript funcionando!",
  });
});

// ==========================================
// STATUS DOS SERVIÇOS
// ==========================================

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Verifica o estado do backend, banco e serviço de inteligência
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Todos os serviços estão funcionando
 *       503:
 *         description: Um ou mais serviços estão indisponíveis
 */

app.get("/api/health", async (_req, res) => {
  const bancoConectado = await testarConexao();

  let inteligenciaConectada = false;
  let dadosInteligencia: unknown = null;

  try {
    const response = await fetch(`${PYTHON_API}/health`);

    if (response.ok) {
      dadosInteligencia = await response.json();
      inteligenciaConectada = true;
    }
  } catch (error) {
    console.error("Erro ao conectar com Python:", error);
  }

  const todosServicosOnline =
    bancoConectado && inteligenciaConectada;

  return res.status(todosServicosOnline ? 200 : 503).json({
    backend: "online",
    banco: bancoConectado ? "conectado" : "offline",
    inteligencia: inteligenciaConectada
      ? dadosInteligencia
      : "offline",
    status: todosServicosOnline ? "healthy" : "degraded",
  });
});

// ==========================================
// ROTA PARA ENDPOINTS NÃO ENCONTRADOS
// ==========================================

app.use((_req, res) => {
  return res.status(404).json({
    erro: "Endpoint não encontrado.",
  });
});

// ==========================================
// TRATAMENTO GLOBAL DE ERROS
// ==========================================

app.use(
  (
    error: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("Erro na aplicação:", error);

    const status =
      error.status && error.status >= 400 && error.status < 600
        ? error.status
        : error.message.includes("CORS")
          ? 403
          : 500;

    return res.status(status).json({
      erro:
        status === 403
          ? "Origem não autorizada."
          : status === 400
            ? "Requisição inválida."
            : "Erro interno do servidor.",
    });
  }
);

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================

app.listen(PORT, () => {
  console.log("------------------------------------");
  console.log("CORE FIX Intelligence");
  console.log(`Backend: http://localhost:${PORT}`);
  console.log(`Swagger: http://localhost:${PORT}/api-docs`);
  console.log(`Python: ${PYTHON_API}`);
  console.log("------------------------------------");

  testarConexao();
});
