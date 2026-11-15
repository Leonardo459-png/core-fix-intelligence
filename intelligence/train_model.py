from pathlib import Path

import joblib
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay
)
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


# Caminhos do projeto
BASE_DIR = Path(__file__).resolve().parent

DATASET_PATH = BASE_DIR / "datasets" / "eventos_smart_home.csv"
MODEL_PATH = BASE_DIR / "models" / "classificador_eventos.joblib"
REPORT_PATH = BASE_DIR / "reports" / "matriz_confusao.png"


# 1. Carregar dataset
print("Carregando dataset...")

df = pd.read_csv(DATASET_PATH)

X = df.drop(columns=["suspeito"])
y = df["suspeito"]

print("Total de registros:", len(df))
print("Distribuição das classes:")
print(y.value_counts())


# 2. Separar treinamento e teste
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.30,
    random_state=42,
    stratify=y
)


# 3. Criar pipeline de Machine Learning
modelo = Pipeline([
    ("scaler", StandardScaler()),
    ("classifier", RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        class_weight="balanced"
    ))
])


# 4. Treinar modelo
print("\nTreinando modelo...")

modelo.fit(X_train, y_train)


# 5. Fazer previsões
previsoes = modelo.predict(X_test)

acuracia = accuracy_score(y_test, previsoes)

print("\nAcurácia:", round(acuracia * 100, 2), "%")

print("\nRelatório de classificação:")
print(
    classification_report(
        y_test,
        previsoes,
        target_names=["Normal", "Suspeito"],
        zero_division=0
    )
)


# 6. Validação cruzada
print("\nExecutando validação cruzada...")

scores = cross_val_score(
    modelo,
    X,
    y,
    cv=3,
    scoring="accuracy"
)

print("Resultados por divisão:", scores)
print("Média da validação cruzada:", round(scores.mean() * 100, 2), "%")


# 7. Gerar matriz de confusão
matriz = confusion_matrix(y_test, previsoes)

display = ConfusionMatrixDisplay(
    confusion_matrix=matriz,
    display_labels=["Normal", "Suspeito"]
)

display.plot(cmap="Blues", values_format="d")
plt.title("CORE FIX - Matriz de Confusão")
plt.tight_layout()
plt.savefig(REPORT_PATH)
plt.close()


# 8. Salvar modelo treinado
joblib.dump(modelo, MODEL_PATH)

print("\nModelo salvo em:", MODEL_PATH)
print("Matriz de confusão salva em:", REPORT_PATH)

print("\nTREINAMENTO CONCLUÍDO!")
