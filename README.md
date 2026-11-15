# CORE FIX Intelligence

Plataforma web de **casa inteligente e seguranca residencial**. O morador cadastra
sensores, acompanha a casa em um painel e usa Machine Learning para identificar
eventos suspeitos, com chatbot integrado e area administrativa.

## Arquitetura

| Pasta | Tecnologia | Porta |
|---|---|---|
| `frontend/` | React + TypeScript + Vite | 5173 |
| `backend/` | Node.js + Express + TypeScript + PostgreSQL (Swagger em `/api-docs`) | 3000 |
| `intelligence/` | Python + FastAPI (Random Forest e OpenAI) | 8001 |

Se o servico de inteligencia estiver desligado, o painel continua funcionando e
mostra "Inteligencia offline".

## Requisitos
- Node.js 20 ou superior
- Python 3.10 ou superior (de preferencia 3.12 ou 3.13)
- PostgreSQL

## Como rodar

### 1. Banco de dados
Crie um banco (por exemplo, `corefix`) e rode o script completo, que cria todas as
tabelas e migracoes:
```
psql -U postgres -d corefix -f backend/database/banco_completo.sql
```
(ou abra o arquivo no pgAdmin, em Query Tool, e execute).

### 2. Variaveis de ambiente
Copie cada `.env.example` para `.env` na mesma pasta e preencha:
- `backend/.env.example` -> `backend/.env` (obrigatorios: `DATABASE_URL` e `JWT_SECRET`)
- `frontend/.env.example` -> `frontend/.env`
- `intelligence/.env.example` -> `intelligence/.env` (chave da OpenAI, para o chatbot)

SMTP, Google e GitHub sao opcionais. Sem SMTP, o link de confirmacao do cadastro
aparece no terminal do backend.

### 3. Backend
```
cd backend
npm install
npm run dev
```

### 4. Inteligencia
```
cd intelligence
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### 5. Frontend
```
npm install
cd frontend
npm install
npm run dev

Acesse http://localhost:5173

### 6. Primeiro acesso e conta administradora
1. Cadastre uma conta no site e confirme o e-mail (link no e-mail ou no terminal do backend).
2. Para torná-la administradora, rode no banco:
```
UPDATE usuarios SET role = 'admin' WHERE email = 'seu_email@exemplo.com';
```
3. Saia e entre de novo: o menu "Administracao" aparece.

## Funcionalidades
- Cadastro com e-mail real e confirmacao por e-mail; login com e-mail/senha, Google e GitHub (JWT)
- Visao geral com metricas reais e grafico dos ultimos 7 dias
- Sensores: CRUD, busca, filtros por status e tipo e ordenacao
- Inteligencia: classificacao de eventos (normal ou suspeito) com confianca e recomendacao
- Alertas, historico, perfil (com foto) e chatbot
- Administracao: usuarios, residencias, sensores, eventos, seguranca e relatorios CSV

## Seguranca
Senhas com hash bcrypt, JWT, rotas de admin protegidas por papel, sensores isolados
por usuario, CORS restrito e consultas SQL parametrizadas. Os arquivos `.env` nao
fazem parte do projeto entregue.
