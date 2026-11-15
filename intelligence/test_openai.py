from dotenv import load_dotenv
from openai import OpenAI
from pathlib import Path
import os

# Carregar variáveis do arquivo .env
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Obter configurações
api_key = os.getenv("OPENAI_API_KEY")
modelo = os.getenv("OPENAI_MODEL", "gpt-5.5")

if not api_key:
    raise ValueError("Chave OPENAI_API_KEY não encontrada.")

# Criar cliente
cliente = OpenAI(api_key=api_key)

# Testar conexão
resposta = cliente.responses.create(
    model=modelo,
    input="Responda em português: conexão com o CORE FIX realizada com sucesso?"
)

print("================================")
print("CORE FIX - TESTE OPENAI")
print("================================")
print(resposta.output_text)
print("================================")
