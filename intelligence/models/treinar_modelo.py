from pathlib import Path

import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_validate, StratifiedKFold


# ==========================================
# CAMINHOS DO PROJETO
# ==========================================

BASE_DIR = Path(__file__).resolve().parents[1]

DATASET_PATH = BASE_DIR / "datasets" / "eventos_smart_home.csv"
MODEL_PATH = BASE_DIR / "models" / "modelo_eventos.pkl"


# ==========================================
# CARREGAMENTO E VALIDAÇÃO DOS DADOS
# ==========================================

dados = pd.read_csv(DATASET_PATH)

features = [
    "hora",
    "movimento",
    "porta_aberta",
    "consumo_energia",
    "presenca_morador"
]

colunas_necessarias = features + ["suspeito"]

if not all(coluna in dados.columns for coluna in colunas_necessarias):
    raise ValueError("O dataset possui colunas ausentes.")

if dados[colunas_necessarias].isnull().any().any():
    raise ValueError("O dataset possui valores vazios.")

X = dados[features]
y = dados["suspeito"]

if y.nunique() != 2:
    raise ValueError("O dataset precisa conter as duas classes: 0 e 1.")

if y.value_counts().min() < 3:
    raise ValueError("Cada classe precisa ter pelo menos 3 registros.")


# ==========================================
# CRIAÇÃO DO MODELO
# ==========================================

modelo = RandomForestClassifier(
    n_estimators=100,
    random_state=42,
    class_weight="balanced"
)


# ==========================================
# VALIDAÇÃO CRUZADA
# ==========================================

validacao = StratifiedKFold(
    n_splits=3,
    shuffle=True,
    random_state=42
)

metricas = {
    "accuracy": "accuracy",
    "precision": "precision",
    "recall": "recall",
    "f1": "f1"
}

resultados = cross_validate(
    modelo,
    X,
    y,
    cv=validacao,
    scoring=metricas
)


# ==========================================
# TREINAMENTO FINAL
# ==========================================

modelo.fit(X, y)

MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

joblib.dump(modelo, MODEL_PATH)


# ==========================================
# RELATÓRIO
# ==========================================

print("========================================")
print("       CORE FIX INTELLIGENCE")
print("========================================")

print(f"Registros utilizados: {len(dados)}")
print(f"Distribuição das classes:\n{y.value_counts()}")

print("\nMÉTRICAS DA VALIDAÇÃO CRUZADA")

for metrica in metricas:
    valores = resultados[f"test_{metrica}"]

    print(
        f"{metrica.capitalize()}: "
        f"{valores.mean():.2%} "
        f"(desvio: {valores.std():.2%})"
    )

print("\nMODELO SALVO COM SUCESSO!")
print(f"Caminho: {MODEL_PATH}")

print("========================================")
