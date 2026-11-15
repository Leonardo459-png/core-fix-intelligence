from pathlib import Path
import os
import re
import unicodedata
import json

import joblib
import pandas as pd

from dotenv import load_dotenv
from openai import OpenAI

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ==========================================
# CONFIGURAÇÕES
# ==========================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "modelo_eventos.pkl"

# ==========================================
# CONFIGURAÇÃO OPENAI
# ==========================================

load_dotenv(BASE_DIR / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")

cliente_openai = (
    OpenAI(api_key=OPENAI_API_KEY)
    if OPENAI_API_KEY
    else None
)

FEATURES = [
    "hora",
    "movimento",
    "porta_aberta",
    "consumo_energia",
    "presenca_morador"
]

LIMITE_CONFIANCA = 70.0

# Limite fictício para demonstração do projeto.
# Os valores não representam kWh nem medições reais.
LIMITE_CONSUMO_DEMONSTRACAO = 0.8


# ==========================================
# APLICAÇÃO FASTAPI
# ==========================================

app = FastAPI(
    title="CORE FIX Intelligence API",
    description="Microsserviço de NLU e Machine Learning para Smart Home.",
    version="2.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# CARREGAMENTO DO MODELO
# ==========================================

try:
    modelo = joblib.load(MODEL_PATH)
    print("Modelo de Machine Learning carregado!")
except Exception as erro:
    modelo = None
    print(f"Erro ao carregar o modelo: {erro}")


# ==========================================
# MODELOS DE DADOS
# ==========================================

# ==========================================
# MODELOS DE DADOS
# ==========================================

class EventoSensor(BaseModel):
    hora: int = Field(ge=0, le=23)
    movimento: int = Field(ge=0, le=1)
    porta_aberta: int = Field(ge=0, le=1)
    consumo_energia: float = Field(ge=0)
    presenca_morador: int = Field(ge=0, le=1)


class MensagemChat(BaseModel):
    mensagem: str = Field(min_length=1, max_length=1000)


class MensagemHistorico(BaseModel):
    tipo: str
    texto: str


class ContextoChat(BaseModel):
    mensagem: str = Field(min_length=1, max_length=1000)
    contexto: dict = Field(default_factory=dict)
    historico: list[MensagemHistorico] = Field(default_factory=list)


# ==========================================
# NORMALIZAÇÃO DE TEXTO
# ==========================================

def normalizar_texto(texto: str) -> str:
    texto = texto.lower().strip()
    texto = unicodedata.normalize("NFD", texto)

    texto = "".join(
        caractere
        for caractere in texto
        if unicodedata.category(caractere) != "Mn"
    )

    return texto


def contem_expressao(texto: str, expressoes: list) -> bool:
    for expressao in expressoes:
        padrao = r"\b" + re.escape(expressao) + r"\b"

        if re.search(padrao, texto):
            return True

    return False


# ==========================================
# EXTRAÇÃO DE ENTIDADES
# ==========================================

def extrair_entidades(mensagem: str) -> dict:
    texto = normalizar_texto(mensagem)
    entidades = {}

    # HORÁRIO
    horario = re.search(
        r"\b(?:as|pelas|por volta das|hora|horario)"
        r"\s*(\d{1,2})\b",
        texto
    )

    if not horario:
        horario = re.search(
            r"\b(\d{1,2})\s*(?:h|horas)\b",
            texto
        )

    if horario:
        hora = int(horario.group(1))

        if 0 <= hora <= 23:
            entidades["hora"] = hora

    # MOVIMENTO
    movimento_numero = re.search(
        r"\bmovimento\b"
        r"(?:\s+(?:foi|detectado|identificado))*"
        r"\s*[:=]?\s*([01])\b",
        texto
    )

    if movimento_numero:
        entidades["movimento"] = int(
            movimento_numero.group(1)
        )

    elif contem_expressao(texto, [
        "sem movimento",
        "nenhum movimento",
        "nao houve movimento",
        "movimento nao detectado"
    ]):
        entidades["movimento"] = 0

    elif contem_expressao(texto, [
        "houve movimento",
        "detectou movimento",
        "movimento detectado",
        "alguem se movimentou"
    ]):
        entidades["movimento"] = 1

    # PORTA
    porta_numero = re.search(
        r"\bporta\b\s*[:=]?\s*([01])\b",
        texto
    )

    if porta_numero:
        entidades["porta_aberta"] = int(
            porta_numero.group(1)
        )

    elif contem_expressao(texto, [
        "porta aberta",
        "porta foi aberta",
        "abriu a porta"
    ]):
        entidades["porta_aberta"] = 1

    elif contem_expressao(texto, [
        "porta fechada",
        "porta foi fechada",
        "fechou a porta"
    ]):
        entidades["porta_aberta"] = 0

    # PRESENÇA DO MORADOR
    presenca_numero = re.search(
        r"\b(?:presenca|presenca do morador|morador)"
        r"\s*(?:do\s+morador)?"
        r"\s*[:=]?\s*([01])\b",
        texto
    )

    if presenca_numero:
        entidades["presenca_morador"] = int(
            presenca_numero.group(1)
        )

    elif contem_expressao(texto, [
        "nao tem ninguem",
        "ninguem em casa",
        "casa vazia",
        "morador ausente",
        "morador nao esta em casa"
    ]):
        entidades["presenca_morador"] = 0

    elif contem_expressao(texto, [
        "tem alguem em casa",
        "morador presente",
        "estou em casa",
        "morador esta em casa"
    ]):
        entidades["presenca_morador"] = 1

    
    # CONSUMO DE ENERGIA
    consumo = re.search(
        r"\b(?:consumo(?:\s+de)?(?:\s+energia)?|"
        r"energia|gasto(?:\s+de)?(?:\s+energia)?)\b"
        r"(?:\s+(?:esta|igual|registrado|atualmente))*"
        r"\s*(?:(?:de|em|:|=)\s*)?"
        r"(\d+(?:[.,]\d+)?)\b",
        texto
    )

    if not consumo:
        consumo = re.search(
            r"\b(\d+(?:[.,]\d+)?)\s*"
            r"(?:kwh|kw|quilowatts?)\b",
            texto
        )

    if consumo:
        entidades["consumo_energia"] = float(
            consumo.group(1).replace(",", ".")
        )


    return entidades


# ==========================================
# IDENTIFICAÇÃO DE INTENÇÕES (NLU)
# ==========================================

def identificar_intencao(texto_original: str) -> dict:
    texto = normalizar_texto(texto_original)

    def resultado(intencao, resposta, confianca=0.95):
        return {
            "intencao": intencao,
            "resposta": resposta,
            "confianca_intencao": confianca
        }

    # ANALISAR EVENTOS
    entidades = extrair_entidades(texto)

    if entidades and (
        "porta_aberta" in entidades
        or "movimento" in entidades
        or "presenca_morador" in entidades
    ):
        return resultado(
            "analisar_evento",
            "Identifiquei informações sobre um evento. "
            "Vou verificar os dados para analisar o comportamento."
        )

    # CONSULTAR CONSUMO
    if contem_expressao(texto, [
        "consumo",
        "energia",
        "gasto de energia",
        "quanto estou gastando",
        "kwh"
    ]):
        return resultado(
            "consultar_consumo",
            "Vou consultar o consumo de energia da sua casa."
        )

    
    # CONSULTAR SUSPEITAS E HISTORICO DE EVENTOS
    if contem_expressao(texto, [
        "suspeita",
        "suspeitas",
        "suspeito",
        "suspeitos",
        "comportamento suspeito",
        "atividade suspeita",
        "atividades suspeitas",
        "evento suspeito",
        "eventos suspeitos",
        "ultimos eventos suspeitos",
        "eventos suspeitos registrados",
        "historico de eventos suspeitos",
        "historico de suspeitas",
        "registros suspeitos",
        "invasao",
        "invasoes",
        "possivel invasao",
        "tentativa de invasao",
        "comportamento anormal"
    ]):
        return resultado(
            "consultar_suspeitas",
            "Vou consultar os eventos e comportamentos suspeitos registrados na sua casa."
        )


    # CONSULTAR ALERTAS
    if contem_expressao(texto, [
        "alerta",
        "alertas",
        "notificacao",
        "notificacoes",
        "ocorrencia",
        "ocorrencias"
    ]):
        return resultado(
            "consultar_alertas",
            "Vou consultar os alertas registrados."
        )

    # CONSULTAR SENSORES
    if contem_expressao(texto, [
        "sensor",
        "sensores",
        "dispositivos",
        "equipamentos"
    ]):
        return resultado(
            "consultar_sensores",
            "Vou consultar os sensores da sua Smart Home."
        )

    # SOLICITAÇÃO EXPLÍCITA DE ANÁLISE
    if contem_expressao(texto, [
        "analisar",
        "analise",
        "verificar evento",
        "avaliar evento",
        "verificar comportamento"
    ]):
        return resultado(
            "analisar_evento",
            "Vou analisar o comportamento informado."
        )

    # AJUDA
    if contem_expressao(texto, [
        "ajuda",
        "como funciona",
        "o que voce faz",
        "quais perguntas",
        "comandos disponiveis"
    ]):
        return resultado(
            "ajuda",
            "Posso consultar sensores, consumo de energia, "
            "alertas e analisar eventos da sua casa."
        )

    # SAUDAÇÃO
    if contem_expressao(texto, [
        "oi",
        "ola",
        "bom dia",
        "boa tarde",
        "boa noite",
        "e ai"
    ]):
        return resultado(
            "saudacao",
            "Olá! Sou o assistente CORE FIX. "
            "Como posso ajudar com sua Smart Home?"
        )

    return resultado(
        "desconhecida",
        "Não consegui entender sua solicitação. "
        "Você pode perguntar sobre sensores, energia ou alertas.",
        0.0
    )


# ==========================================
# RECOMENDAÇÕES INTELIGENTES
# ==========================================

def gerar_recomendacoes(
    evento: EventoSensor,
    suspeito: bool
) -> list:

    recomendacoes = []

    # SEGURANÇA
    if (
        evento.movimento == 1
        and evento.porta_aberta == 1
        and evento.presenca_morador == 0
    ):
        recomendacoes.append({
            "titulo": "Verificação de segurança",
            "mensagem": (
                "Foi detectado movimento com a porta aberta enquanto "
                "o morador estava ausente. Verifique o ambiente e "
                "confirme se o acesso é autorizado."
            ),
            "categoria": "seguranca",
            "prioridade": "alta"
        })

    elif suspeito:
        recomendacoes.append({
            "titulo": "Comportamento suspeito",
            "mensagem": (
                "O modelo identificou um comportamento fora do padrão. "
                "Verifique os sensores e o ambiente."
            ),
            "categoria": "seguranca",
            "prioridade": "alta"
        })

    # ATIVIDADE NOTURNA
    if (
        evento.movimento == 1
        and evento.presenca_morador == 0
        and (evento.hora >= 22 or evento.hora <= 5)
    ):
        recomendacoes.append({
            "titulo": "Atividade em horário incomum",
            "mensagem": (
                "Foi detectada movimentação durante a madrugada com "
                "o morador ausente. Confira o registro do sensor."
            ),
            "categoria": "monitoramento",
            "prioridade": "media"
        })

    # CONSUMO DE ENERGIA
    if evento.consumo_energia >= LIMITE_CONSUMO_DEMONSTRACAO:
        recomendacoes.append({
            "titulo": "Atenção ao consumo de energia",
            "mensagem": (
                "O consumo informado está acima do limite demonstrativo "
                "configurado. Verifique os aparelhos ligados e identifique "
                "possíveis equipamentos com consumo elevado."
            ),
            "categoria": "energia",
            "prioridade": "media"
        })

    # ROTINA NORMAL
    if not recomendacoes:
        recomendacoes.append({
            "titulo": "Rotina dentro do esperado",
            "mensagem": (
                "Não foram identificadas condições que exijam uma ação "
                "imediata. Continue monitorando sua residência."
            ),
            "categoria": "monitoramento",
            "prioridade": "baixa"
        })

    return recomendacoes


# ==========================================
# MACHINE LEARNING
# ==========================================

def executar_classificacao(evento: EventoSensor) -> dict:

    if modelo is None:
        raise HTTPException(
            status_code=503,
            detail="Modelo de Machine Learning indisponível."
        )

    try:
        dados = pd.DataFrame(
            [evento.model_dump()],
            columns=FEATURES
        )

        previsao = modelo.predict(dados)[0]
        probabilidades = modelo.predict_proba(dados)[0]

        probabilidades_por_classe = {
            int(classe): float(probabilidade)
            for classe, probabilidade in zip(
                modelo.classes_,
                probabilidades
            )
        }

        probabilidade_normal = probabilidades_por_classe.get(0, 0.0)
        probabilidade_suspeito = probabilidades_por_classe.get(1, 0.0)

        suspeito = int(previsao) == 1

        confianca = max(
            probabilidades_por_classe.values()
        ) * 100

        classificacao = (
            "suspeito" if suspeito else "normal"
        )

        # GERA RECOMENDAÇÕES CONTEXTUAIS
        recomendacoes = gerar_recomendacoes(evento, suspeito)

        recomendacao = " ".join(
            item["mensagem"] for item in recomendacoes
        )

        return {
            "sistema": "CORE FIX Intelligence",
            "classificacao": classificacao,
            "suspeito": suspeito,
            "confianca": round(confianca, 2),
            "probabilidades": {
                "normal": round(
                    probabilidade_normal * 100, 2
                ),
                "suspeito": round(
                    probabilidade_suspeito * 100, 2
                )
            },
            "recomendacao": recomendacao,
            "recomendacoes": recomendacoes,
            "aprovacao_manual_necessaria": (
                confianca < LIMITE_CONFIANCA
            )
        }

    except HTTPException:
        raise

    except Exception as erro:
        print(f"Erro na classificação: {erro}")

        raise HTTPException(
            status_code=500,
            detail="Erro durante a classificação do evento."
        )


# ==========================================
# ROTAS PRINCIPAIS
# ==========================================

@app.get("/")
def home():
    return {
        "sistema": "CORE FIX Intelligence",
        "status": "online",
        "versao": "2.3.0"
    }


@app.get("/health")
def health():
    return {
        "service": "CORE FIX Intelligence",
        "status": "healthy",
        "model_loaded": modelo is not None,
        "nlu_available": True,
        "version": "2.3.0"
    }


# ==========================================
# ROTA DE INTERPRETAÇÃO DE MENSAGENS
# ==========================================

@app.post("/interpretar-mensagem")
def interpretar_mensagem(dados: MensagemChat):

    try:
        mensagem = dados.mensagem.strip()

        if not mensagem:
            raise HTTPException(
                status_code=400,
                detail="A mensagem não pode estar vazia."
            )

        intencao = identificar_intencao(mensagem)
        entidades = extrair_entidades(mensagem)

        return {
            "sistema": "CORE FIX Intelligence",
            "mensagem": mensagem,
            "intencao": intencao["intencao"],
            "entidades": entidades,
            "metodo": "reconhecimento_por_regras",
            "confianca_intencao": intencao["confianca_intencao"],
            "resposta": intencao["resposta"]
        }

    except HTTPException:
        raise

    except Exception as erro:
        print(f"Erro na interpretação da mensagem: {erro}")

        raise HTTPException(
            status_code=500,
            detail="Erro ao interpretar a mensagem."
        )


# ==========================================
# ROTA DE ANÁLISE DE EVENTOS
# ==========================================

@app.post("/analisar-evento")
def analisar_evento(evento: EventoSensor):
    return executar_classificacao(evento)

    # ==========================================
# CHATBOT COM INTELIGÊNCIA ARTIFICIAL - OPENAI
# ==========================================

@app.post("/gerar-resposta")
def gerar_resposta(dados: ContextoChat):

    if cliente_openai is None:
        raise HTTPException(
            status_code=503,
            detail="A integração com a OpenAI não está configurada."
        )

    try:
        contexto_json = json.dumps(
            dados.contexto,
            ensure_ascii=False
        )

        historico_texto = "\n".join(
            [
                f"{'Usuário' if item.tipo == 'usuario' else 'CORE FIX'}: {item.texto}"
                for item in dados.historico[-10:]
            ]
        )

        instrucoes = """
        Você é o assistente virtual CORE FIX Intelligence,
        especializado em casas inteligentes e automação residencial.

        Regras obrigatórias:
        - Responda sempre em português do Brasil.
        - Seja claro, educado e objetivo.
        - Utilize os dados fornecidos no contexto para responder.
        - Considere o histórico da conversa para entender perguntas anteriores.
        - Não invente sensores, valores, alertas ou informações.
        - Se uma informação não estiver disponível, informe isso.
        - Não afirme que ocorreu uma invasão apenas por uma
          classificação de comportamento suspeito.
        - Explique resultados de Machine Learning como estimativas,
          não como certezas.
        - Não invente medições reais de consumo de energia.
        - Considere o histórico como contexto, não como fonte de
          informações atuais dos sensores.
        """

        resposta = cliente_openai.responses.create(
            model=OPENAI_MODEL,
            instructions=instrucoes,
            input=(
                f"Histórico da conversa:\n{historico_texto}\n\n"
                f"Pergunta atual do usuário: {dados.mensagem}\n\n"
                f"Dados disponíveis no sistema: {contexto_json}"
            )
        )

        return {
            "sistema": "CORE FIX Intelligence",
            "resposta": resposta.output_text,
            "modelo": OPENAI_MODEL
        }

    except Exception as erro:
        print(f"Erro ao gerar resposta com OpenAI: {erro}")

        raise HTTPException(
            status_code=502,
            detail="Não foi possível gerar uma resposta com a inteligência artificial."
        )