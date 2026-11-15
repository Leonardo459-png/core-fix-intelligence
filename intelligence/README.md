# Servico de inteligencia (FastAPI)

Microsservico Python desacoplado do backend, acessado por API REST (porta 8001).

## Rotas
| Metodo | Rota | Funcao |
|---|---|---|
| GET | `/health` | Estado do servico (usado pelo painel) |
| POST | `/analisar-evento` | Classifica um evento como normal ou suspeito |
| POST | `/interpretar-mensagem` | Entende a intencao da mensagem do chatbot |
| POST | `/gerar-resposta` | Gera a resposta do chatbot (API da OpenAI) |

## Modelo de Machine Learning
- Algoritmo: Random Forest (scikit-learn), com StandardScaler no pipeline.
- Dataset: `datasets/eventos_smart_home.csv` (hora, movimento, porta_aberta,
  consumo_energia, presenca_morador e o alvo `suspeito`).
- Modelo usado pela API: `models/modelo_eventos.pkl`, gerado por `models/treinar_modelo.py`.
- Limiar de confianca: abaixo de 70% o evento exige verificacao manual.

## Como rodar
```
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```
Crie `intelligence/.env` a partir de `.env.example` (chave da OpenAI).
