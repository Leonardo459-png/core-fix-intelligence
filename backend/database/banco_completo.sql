-- ==============================================================
-- CORE FIX INTELLIGENCE - banco completo (rode UMA vez num banco novo)
-- Contem: tabelas base (schema.sql) + migracoes 002 a 008, na ordem.
-- ==============================================================


-- >>> schema.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Estrutura inicial do banco PostgreSQL
-- ==========================================

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensores (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    ambiente VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ativo',
    valor_atual NUMERIC(10,2),
    unidade VARCHAR(20),
    ultima_atividade TIMESTAMP,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eventos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    sensor_id INTEGER REFERENCES sensores(id) ON DELETE SET NULL,
    tipo VARCHAR(80) NOT NULL,
    descricao TEXT,
    gravidade VARCHAR(20) DEFAULT 'normal',
    suspeito BOOLEAN DEFAULT FALSE,
    confianca NUMERIC(5,2),
    dados JSONB,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recomendacoes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
    titulo VARCHAR(150) NOT NULL,
    mensagem TEXT NOT NULL,
    categoria VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pendente',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhorar as consultas

CREATE INDEX IF NOT EXISTS idx_sensores_usuario
ON sensores(usuario_id);

CREATE INDEX IF NOT EXISTS idx_eventos_usuario
ON eventos(usuario_id);

CREATE INDEX IF NOT EXISTS idx_eventos_criado
ON eventos(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_recomendacoes_usuario
ON recomendacoes(usuario_id);


-- >>> 002_admin.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Migração 002: papéis de usuário (admin / usuário comum)
-- ==========================================

-- 1. Coluna de papel. Todo usuário existente passa a ser 'usuario'.
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'usuario';

-- 2. Só aceita os dois papéis previstos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_role_check'
  ) THEN
    ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_role_check CHECK (role IN ('usuario', 'admin'));
  END IF;
END $$;

-- 3. Torna administrador o usuário MAIS ANTIGO, se ainda não existir nenhum admin.
UPDATE usuarios
SET role = 'admin'
WHERE id = (SELECT MIN(id) FROM usuarios)
  AND NOT EXISTS (SELECT 1 FROM usuarios WHERE role = 'admin');

-- 4. Índices para as telas de alertas e histórico (filtros e ordenação).
CREATE INDEX IF NOT EXISTS idx_eventos_suspeito
ON eventos(suspeito);

CREATE INDEX IF NOT EXISTS idx_usuarios_role
ON usuarios(role);

-- Para promover outra pessoa manualmente (troque o e-mail):
-- UPDATE usuarios SET role = 'admin' WHERE email = 'email@exemplo.com';


-- >>> 003_auditoria.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Migração 003: registro de auditoria da área administrativa
-- ==========================================

CREATE TABLE IF NOT EXISTS auditoria (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER,
  admin_nome  VARCHAR(100),
  acao        VARCHAR(50) NOT NULL,
  alvo        VARCHAR(150),
  detalhe     TEXT,
  criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_criado_em
ON auditoria(criado_em DESC);


-- >>> 004_perfil_usuario.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Migração 004: gênero e data de nascimento no cadastro
-- ==========================================

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS genero VARCHAR(20);

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS data_nascimento DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_genero_check'
  ) THEN
    ALTER TABLE usuarios
    ADD CONSTRAINT usuarios_genero_check
    CHECK (genero IS NULL OR genero IN ('feminino', 'masculino', 'outro', 'nao_informar'));
  END IF;
END $$;


-- >>> 005_verificacao_email.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Migração 005: verificação de e-mail no cadastro
-- ==========================================

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS token_verificacao VARCHAR(64);

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS token_verificacao_expira TIMESTAMP;

-- Quem já tinha conta antes desta migração continua podendo entrar
UPDATE usuarios
SET email_verificado = TRUE
WHERE email_verificado = FALSE
  AND token_verificacao IS NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_token_verificacao
ON usuarios (token_verificacao);


-- >>> 006_perfil_social.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Migração 006: marca contas criadas por login social (Google/GitHub)
-- ==========================================

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS login_social BOOLEAN NOT NULL DEFAULT FALSE;


-- >>> 007_perfil_residencia.sql
-- ==========================================
-- CORE FIX INTELLIGENCE
-- Migração 007: residência e contato de emergência no perfil.
-- ==========================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS residencia_apelido VARCHAR(60);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS residencia_cidade VARCHAR(60);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS residencia_tipo VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS residencia_moradores SMALLINT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contato_emergencia_nome VARCHAR(80);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contato_emergencia_telefone VARCHAR(15);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_residencia_tipo_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_residencia_tipo_check
    CHECK (residencia_tipo IS NULL OR residencia_tipo IN ('casa', 'apartamento'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_residencia_moradores_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_residencia_moradores_check
    CHECK (residencia_moradores IS NULL OR residencia_moradores BETWEEN 1 AND 20);
  END IF;
END $$;


-- >>> 008_foto_perfil.sql
-- Foto de perfil do usuário (imagem reduzida, guardada como texto data URL)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT;

