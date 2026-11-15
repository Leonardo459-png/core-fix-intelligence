import { Request, Response } from "express";

import {
  interpretarMensagem,
  analisarComML,
  gerarRespostaIA,
  Entidades,
  MensagemHistorico,
} from "../services/inteligencia.service";

import { salvarEvento } from "../services/evento.service";

import {
  consultarConsumo,
  consultarSensores,
  consultarAlertas,
  consultarSuspeitas,
} from "../services/chatbot.service";

// ==========================================
// TIPOS E VALIDAÇÕES
// ==========================================

type DadosEvento = Required<Entidades>;

type ContextoIA = Record<string, unknown>;

function corpoValido(body: unknown): body is Record<string, unknown> {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body)
  );
}

function validarDadosEvento(
  dados: Partial<Entidades>
): dados is DadosEvento {
  return (
    typeof dados.hora === "number" &&
    Number.isInteger(dados.hora) &&
    dados.hora >= 0 &&
    dados.hora <= 23 &&

    typeof dados.movimento === "number" &&
    [0, 1].includes(dados.movimento) &&

    typeof dados.porta_aberta === "number" &&
    [0, 1].includes(dados.porta_aberta) &&

    typeof dados.consumo_energia === "number" &&
    Number.isFinite(dados.consumo_energia) &&
    dados.consumo_energia >= 0 &&

    typeof dados.presenca_morador === "number" &&
    [0, 1].includes(dados.presenca_morador)
  );
}

const nomesCampos: Record<keyof Entidades, string> = {
  hora: "horário do evento (0 a 23)",
  movimento: "movimento detectado (0 para não, 1 para sim)",
  porta_aberta: "estado da porta (0 fechada, 1 aberta)",
  consumo_energia: "consumo de energia (número maior ou igual a zero)",
  presenca_morador: "presença do morador (0 ausente, 1 presente)",
};

// ==========================================
// HISTÓRICO TEMPORÁRIO DO CHATBOT
// ==========================================

function obterHistoricoValido(valor: unknown): MensagemHistorico[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  const historico: MensagemHistorico[] = [];

  for (const item of valor) {
    if (
      item !== null &&
      typeof item === "object" &&
      "tipo" in item &&
      "texto" in item &&
      (item.tipo === "usuario" || item.tipo === "bot") &&
      typeof item.texto === "string" &&
      item.texto.trim().length > 0
    ) {
      historico.push({
        tipo: item.tipo,
        texto: item.texto.trim().slice(0, 1000),
      });
    }
  }

  return historico.slice(-10);
}

// ==========================================
// RESPOSTA COM OPENAI E FALLBACK
// ==========================================

async function obterRespostaChatbot(
  pergunta: string,
  contexto: ContextoIA,
  respostaFallback: string,
  historico: MensagemHistorico[] = []
): Promise<string> {
  try {
    const resposta = await gerarRespostaIA(
      pergunta,
      contexto,
      historico
    );

    if (typeof resposta === "string" && resposta.trim()) {
      return resposta.trim();
    }

    return respostaFallback;
  } catch (error) {
    console.error(
      "OpenAI indisponível. Usando resposta alternativa:",
      error
    );

    return respostaFallback;
  }
}

// ==========================================
// ANÁLISE DE EVENTO COM MACHINE LEARNING
// ==========================================

export async function analisarEvento(req: Request, res: Response) {
  try {
    if (!corpoValido(req.body)) {
      return res.status(400).json({
        erro: "O corpo da requisição deve ser um objeto JSON válido.",
      });
    }

    const dadosRecebidos = req.body as Partial<Entidades>;

    if (!validarDadosEvento(dadosRecebidos)) {
      return res.status(400).json({
        erro: "Dados inválidos para análise.",
        campos: {
          hora: "Número inteiro entre 0 e 23.",
          movimento: "Informe 0 ou 1.",
          porta_aberta: "Informe 0 ou 1.",
          consumo_energia: "Número maior ou igual a zero.",
          presenca_morador: "Informe 0 ou 1.",
        },
      });
    }

    const dados: DadosEvento = dadosRecebidos;

    const resultado = await analisarComML(dados);

    const eventoId = await salvarEvento(dados, resultado);

    return res.json({
      ...resultado,
      evento_id: eventoId,
      salvo_no_banco: true,
    });

  } catch (error) {
    console.error("Erro na análise:", error);

    return res.status(503).json({
      erro: "Não foi possível analisar o evento.",
    });
  }
}

// ==========================================
// CHATBOT CORE FIX INTELLIGENCE
// ==========================================

export async function chatbot(req: Request, res: Response) {
  try {
    if (!corpoValido(req.body)) {
      return res.status(400).json({
        erro: "O corpo da requisição deve ser um objeto JSON válido.",
      });
    }

    const pergunta =
      typeof req.body.pergunta === "string"
        ? req.body.pergunta.trim()
        : "";

    if (!pergunta) {
      return res.status(400).json({
        erro: "Digite uma pergunta válida para o ChatBot.",
      });
    }

    // HISTÓRICO TEMPORÁRIO DA CONVERSA
    const historico = obterHistoricoValido(req.body.historico);

    // 1. INTERPRETAR MENSAGEM COM NLU PYTHON

    const interpretacao = await interpretarMensagem(pergunta);

    const intencao = interpretacao.intencao;

    const entidadesRecebidas = interpretacao.entidades;

    const entidades: Partial<Entidades> =
      entidadesRecebidas &&
      typeof entidadesRecebidas === "object" &&
      !Array.isArray(entidadesRecebidas)
        ? entidadesRecebidas
        : {};

    // 2. CONSULTAR CONSUMO DE ENERGIA

    if (intencao === "consultar_consumo") {
      const resultado = await consultarConsumo();

      const respostaFallback =
        resultado.quantidade > 0
          ? `Encontrei ${resultado.quantidade} sensor(es) relacionado(s) à energia. A soma dos valores registrados é ${resultado.total.toLocaleString("pt-BR")} kWh.`
          : "Ainda não existem dados de consumo de energia registrados no banco de dados.";

      const resposta = await obterRespostaChatbot(
        pergunta,
        {
          intencao,
          dados_consumo: resultado,
        },
        respostaFallback,
        historico
      );

      return res.json({
        sistema: "CORE FIX Intelligence",
        intencao,
        ...resultado,
        resposta,
      });
    }

    // 3. CONSULTAR SENSORES

    if (intencao === "consultar_sensores") {
      const resultado = await consultarSensores();

      const respostaFallback =
        `Sua residência possui ${resultado.total} sensor(es) cadastrado(s), sendo ${resultado.ativos} ativo(s).`;

      const resposta = await obterRespostaChatbot(
        pergunta,
        {
          intencao,
          total_sensores: resultado.total,
          sensores_ativos: resultado.ativos,
          sensores: resultado.sensores,
        },
        respostaFallback,
        historico
      );

      return res.json({
        sistema: "CORE FIX Intelligence",
        intencao,
        total_sensores: resultado.total,
        sensores_ativos: resultado.ativos,
        sensores: resultado.sensores,
        resposta,
      });
    }

    // 4. CONSULTAR ALERTAS E EVENTOS

    if (intencao === "consultar_alertas") {
      const resultado = await consultarAlertas();

      const respostaFallback =
        `Encontrei ${resultado.total} evento(s) registrado(s), sendo ${resultado.suspeitos} suspeito(s).`;

      const resposta = await obterRespostaChatbot(
        pergunta,
        {
          intencao,
          total_eventos: resultado.total,
          eventos_suspeitos: resultado.suspeitos,
          eventos: resultado.eventos,
        },
        respostaFallback,
        historico
      );

      return res.json({
        sistema: "CORE FIX Intelligence",
        intencao,
        total_eventos: resultado.total,
        eventos_suspeitos: resultado.suspeitos,
        eventos: resultado.eventos,
        resposta,
      });
    }

    // 5. CONSULTAR COMPORTAMENTOS SUSPEITOS

    if (intencao === "consultar_suspeitas") {
      const resultado = await consultarSuspeitas();

      const respostaFallback =
        resultado.total > 0
          ? `Atenção! Existem ${resultado.total} evento(s) suspeito(s) registrado(s).`
          : "Não existem eventos suspeitos registrados no banco de dados.";

      const resposta = await obterRespostaChatbot(
        pergunta,
        {
          intencao,
          total_suspeitos: resultado.total,
          eventos: resultado.eventos,
        },
        respostaFallback,
        historico
      );

      return res.json({
        sistema: "CORE FIX Intelligence",
        intencao,
        total_suspeitos: resultado.total,
        eventos: resultado.eventos,
        resposta,
      });
    }

    // 6. ANALISAR EVENTO COM MACHINE LEARNING

    if (intencao === "analisar_evento") {
      const camposObrigatorios: (keyof Entidades)[] = [
        "hora",
        "movimento",
        "porta_aberta",
        "consumo_energia",
        "presenca_morador",
      ];

      const camposFaltando = camposObrigatorios.filter(
        (campo) =>
          entidades[campo] === undefined ||
          entidades[campo] === null
      );

      if (camposFaltando.length > 0) {
        return res.json({
          sistema: "CORE FIX Intelligence",
          intencao,
          entidades,
          aguardando_informacoes: true,
          campos_faltando: camposFaltando,
          resposta:
            "Consigo analisar esse evento! Antes, preciso destas informações: " +
            camposFaltando
              .map((campo) => nomesCampos[campo])
              .join("; ") +
            ".",
        });
      }

      // VALIDAR TODOS OS VALORES EXTRAÍDOS PELO NLU

      if (!validarDadosEvento(entidades)) {
        return res.status(400).json({
          sistema: "CORE FIX Intelligence",
          erro: "Os dados identificados na mensagem são inválidos.",
          entidades,
          resposta: "Confira os valores informados e tente novamente.",
        });
      }

      const dadosCompletos: DadosEvento = entidades;

      // EXECUTAR MACHINE LEARNING

      const resultadoML = await analisarComML(dadosCompletos);

      // SALVAR RESULTADO NO BANCO

      const eventoId = await salvarEvento(
        dadosCompletos,
        resultadoML
      );

      const respostaFallback =
        resultadoML.recomendacao +
        (resultadoML.aprovacao_manual_necessaria
          ? " A confiança da classificação está abaixo de 70%; recomenda-se revisão humana."
          : "");

      // GERAR EXPLICAÇÃO COM OPENAI

      const resposta = await obterRespostaChatbot(
        pergunta,
        {
          intencao,
          dados_evento: dadosCompletos,
          resultado_machine_learning: resultadoML,
          evento_id: eventoId,
          salvo_no_banco: true,
        },
        respostaFallback,
        historico
      );

      return res.json({
        sistema: "CORE FIX Intelligence",
        intencao,
        entidades: dadosCompletos,
        analise: resultadoML,
        recomendacoes: resultadoML.recomendacoes || [],
        evento_id: eventoId,
        salvo_no_banco: true,
        resposta,
      });
    }

    // 7. AJUDA, SAUDAÇÃO OU INTENÇÃO NÃO RECONHECIDA

    const respostaFallback =
      interpretacao.resposta ||
      "Posso ajudar com sensores, consumo de energia, alertas e análise de eventos.";

    const resposta = await obterRespostaChatbot(
      pergunta,
      {
        intencao,
        entidades,
      },
      respostaFallback,
      historico
    );

    return res.json({
      sistema: "CORE FIX Intelligence",
      intencao,
      resposta,
    });

  } catch (error) {
    console.error("Erro no ChatBot:", error);

    return res.status(503).json({
      erro: "Não foi possível processar sua mensagem.",
    });
  }
}
