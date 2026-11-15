
function obterPythonApi(): string {
  return process.env.PYTHON_API || "http://127.0.0.1:8001";
}

// ==========================================
// INTERFACES
// ==========================================

export interface Entidades {
  hora?: number;
  movimento?: number;
  porta_aberta?: number;
  consumo_energia?: number;
  presenca_morador?: number;
}

export interface ResultadoML {
  sistema?: string;
  classificacao?: string;
  suspeito: boolean;
  confianca: number;
  recomendacao: string;
  recomendacoes?: {
    titulo: string;
    mensagem: string;
    categoria: string;
    prioridade: string;
  }[];
  aprovacao_manual_necessaria: boolean;
}

export interface InterpretacaoNLU {
  intencao: string;
  entidades: Entidades;
  resposta: string;
  confianca_intencao?: number;
}

export interface RespostaIA {
  sistema: string;
  resposta: string;
  modelo: string;
}

// Histórico temporário da conversa
export interface MensagemHistorico {
  tipo: "usuario" | "bot";
  texto: string;
}

// ==========================================
// INTERPRETAÇÃO DE MENSAGENS COM NLU
// ==========================================

export async function interpretarMensagem(
  mensagem: string
): Promise<InterpretacaoNLU> {
  const response = await fetch(
    `${obterPythonApi()}/interpretar-mensagem`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mensagem }),
    }
  );

  if (!response.ok) {
    throw new Error("Erro ao interpretar mensagem com Python.");
  }

  return (await response.json()) as InterpretacaoNLU;
}

// ==========================================
// ANÁLISE DE EVENTOS COM MACHINE LEARNING
// ==========================================

export async function analisarComML(
  dados: Entidades
): Promise<ResultadoML> {
  const response = await fetch(
    `${obterPythonApi()}/analisar-evento`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dados),
    }
  );

  const resultado = await response.json();

  if (!response.ok) {
    throw new Error(
      resultado.detail ||
      "Erro na análise de Machine Learning."
    );
  }

  return resultado as ResultadoML;
}

// ==========================================
// GERAÇÃO DE RESPOSTAS COM OPENAI
// ==========================================

export async function gerarRespostaIA(
  mensagem: string,
  contexto: Record<string, unknown>,
  historico: MensagemHistorico[] = []
): Promise<string> {
  const response = await fetch(
    `${obterPythonApi()}/gerar-resposta`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mensagem,
        contexto,
        historico: historico.slice(-10),
      }),
    }
  );

  const resultado = await response.json() as Partial<RespostaIA> & {
    detail?: string;
  };

  if (!response.ok) {
    throw new Error(
      resultado.detail ||
      "Erro ao gerar resposta com a inteligência artificial."
    );
  }

  if (
    typeof resultado.resposta !== "string" ||
    !resultado.resposta.trim()
  ) {
    throw new Error("A OpenAI retornou uma resposta vazia.");
  }

  return resultado.resposta;
}
