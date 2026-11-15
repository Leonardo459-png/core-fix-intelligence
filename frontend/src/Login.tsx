import { useEffect, useState, type FormEvent } from 'react'
import './Login.css'
import FundoRede from './FundoRede'
import Sociais from './Sociais'
import { apiJson, salvarToken, limparToken, mensagemDeErro, ErroApi, type Usuario } from './api'

// Ícones em SVG (leves e nítidos em qualquer tela). Decorativos: o botão tem aria-label.
function IconeOlho() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconeOlhoCortado() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5" />
      <path d="M6.6 6.6A17.2 17.2 0 0 0 2 12s3.6 7 10 7a10.1 10.1 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

type Props = {
  onEntrar: (usuario: Usuario) => void
}

type Modo = 'login' | 'cadastro'

const IDADE_MINIMA = 18

const GENEROS: [string, string][] = [
  ['feminino', 'Feminino'],
  ['masculino', 'Masculino'],
  ['outro', 'Outro'],
  ['nao_informar', 'Prefiro não informar'],
]

// Data de hoje no formato AAAA-MM-DD (limite do campo de nascimento)
function hojeISO() {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function calcularIdade(isoData: string) {
  const [ano, mes, dia] = isoData.split('-').map(Number)
  const hoje = new Date()
  let idade = hoje.getFullYear() - ano
  const fezAniversario =
    hoje.getMonth() + 1 > mes ||
    (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia)
  if (!fezAniversario) idade--
  return idade
}

type Erros = {
  nome?: string
  email?: string
  dataNascimento?: string
  genero?: string
  senha?: string
  confirmar?: string
  geral?: string
}

// Tela de acesso: login e cadastro no mesmo componente (DRY)
function Login({ onEntrar }: Props) {
  const [modo, setModo] = useState<Modo>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [genero, setGenero] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false)
  const [erros, setErros] = useState<Erros>({})
  const [enviando, setEnviando] = useState(false)
  // E-mail aguardando confirmação (mostra a tela "Verifique seu e-mail")
  const [pendente, setPendente] = useState<string | null>(null)
  const [reenvio, setReenvio] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [reenviando, setReenviando] = useState(false)
  // Resultado do clique no link do e-mail (?verificado=1 ou 0)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // Volta do login com GitHub: o backend devolve o token (ou o erro) no fragmento da URL
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const tokenGithub = hash.get('github_token')
    const erroGithub = hash.get('github_erro')
    if (!tokenGithub && !erroGithub) return

    window.history.replaceState(null, '', window.location.pathname + window.location.search)

    if (erroGithub) {
      setAviso({ tipo: 'erro', texto: erroGithub })
      return
    }

    salvarToken(tokenGithub as string)
    apiJson<{ usuario: Usuario }>('/api/perfil')
      .then((perfil) => onEntrar(perfil.usuario))
      .catch((error: unknown) => {
        limparToken()
        setAviso({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível entrar com o GitHub.') })
      })
    // roda só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const resultado = params.get('verificado')
    if (resultado === null) return

    setAviso(
      resultado === '1'
        ? { tipo: 'ok', texto: 'E-mail confirmado! Agora é só entrar com seu e-mail e senha.' }
        : { tipo: 'erro', texto: 'Link inválido ou expirado. Entre com seu e-mail e senha para receber um novo.' },
    )
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  }, [])

  async function reenviarEmail() {
    if (!pendente) return
    setReenviando(true)
    setReenvio(null)
    try {
      await apiJson('/api/auth/reenviar-verificacao', {
        method: 'POST',
        body: JSON.stringify({ email: pendente }),
      })
      setReenvio({ tipo: 'ok', texto: 'Enviamos um novo link. Confira também o spam.' })
    } catch (error) {
      setReenvio({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível reenviar agora.') })
    } finally {
      setReenviando(false)
    }
  }

  // Nada fica guardado entre uma tela e outra: tudo volta ao estado inicial
  function limparFormulario() {
    setNome('')
    setEmail('')
    setDataNascimento('')
    setGenero('')
    setSenha('')
    setConfirmar('')
    setMostrarSenha(false)
    setMostrarConfirmar(false)
    setErros({})
    setAviso(null)
    setReenvio(null)
  }

  function voltarParaEntrar() {
    setPendente(null)
    limparFormulario()
    setModo('login')
  }

  const cadastro = modo === 'cadastro'

  function trocarModo(novo: Modo) {
    limparFormulario()
    setModo(novo)
  }

  // Validação no próprio formulário, com a mensagem junto de cada campo (Nielsen #5 e #9)
  function validar(): Erros {
    const e: Erros = {}
    if (cadastro && nome.trim().length < 2) e.nome = 'Informe seu nome.'
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Informe um e-mail válido.'
    if (cadastro) {
      if (!dataNascimento || dataNascimento.length < 10) {
        e.dataNascimento = 'Informe sua data de nascimento.'
      } else if (dataNascimento > hojeISO()) {
        e.dataNascimento = 'A data não pode estar no futuro.'
      } else if (calcularIdade(dataNascimento) < IDADE_MINIMA) {
        e.dataNascimento = `É necessário ter ${IDADE_MINIMA} anos ou mais.`
      }
      if (!genero) e.genero = 'Selecione uma opção.'
    }
    if (!senha) e.senha = 'Informe a senha.'
    else if (cadastro && senha.length < 8) {
      e.senha = 'A senha deve ter pelo menos 8 caracteres.'
    }
    if (cadastro) {
      if (!confirmar) e.confirmar = 'Confirme a senha.'
      else if (confirmar !== senha) e.confirmar = 'As senhas não coincidem.'
    }
    return e
  }

  // Login/cadastro com Google: o backend valida o token e devolve a sessão do sistema
  async function entrarComGoogle(credencial: string) {
    const resposta = await apiJson<{ token: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: credencial }),
    })

    salvarToken(resposta.token)

    try {
      const perfil = await apiJson<{ usuario: Usuario }>('/api/perfil')
      onEntrar(perfil.usuario)
    } catch (error) {
      limparToken()
      throw error
    }
  }

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()

    const encontrados = validar()
    setErros(encontrados)
    if (Object.keys(encontrados).length > 0) return

    setEnviando(true)

    try {
      if (cadastro) {
        await apiJson('/api/auth/registrar', {
          method: 'POST',
          body: JSON.stringify({
            nome: nome.trim(),
            email: email.trim(),
            senha,
            genero,
            data_nascimento: dataNascimento,
          }),
        })

        // A conta só é liberada depois de confirmar o e-mail
        const enderecoCadastrado = email.trim()
        limparFormulario()
        setPendente(enderecoCadastrado)
        return
      }

      const login = await apiJson<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), senha }),
      })

      salvarToken(login.token)

      // O login não devolve o papel; ele vem do perfil
      const perfil = await apiJson<{ usuario: Usuario }>('/api/perfil')
      onEntrar(perfil.usuario)
    } catch (error) {
      limparToken()

      // Conta existe, mas o e-mail ainda não foi confirmado
      if (error instanceof ErroApi && error.status === 403) {
        setPendente(email.trim())
        return
      }

      setErros({
        geral: mensagemDeErro(error, 'Não foi possível entrar. Tente novamente.'),
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="auth-page" id="conteudo">
      <FundoRede />
      <section className={`auth-card${cadastro && !pendente ? ' auth-card-larga' : ''}`} aria-labelledby="auth-titulo">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="" width="48" height="48" />
          <div>
            <strong>CORE FIX</strong>
            <span>INTELLIGENCE</span>
          </div>
        </div>

        {pendente ? (
          <div className="auth-pendente">
            <h1 id="auth-titulo">Verifique seu e-mail</h1>
            <p className="auth-sub">
              Enviamos um link de confirmação para <strong>{pendente}</strong>. Clique nele para
              ativar a conta e depois entre com seu e-mail e senha.
            </p>
            <p className="auth-dica">O link vale por 24 horas. Se não encontrar, olhe a caixa de spam.</p>

            {reenvio && (
              <p
                className={reenvio.tipo === 'ok' ? 'auth-aviso-ok' : 'auth-erro-geral'}
                role={reenvio.tipo === 'ok' ? 'status' : 'alert'}
              >
                {reenvio.texto}
              </p>
            )}

            <button type="button" className="auth-enviar" onClick={reenviarEmail} disabled={reenviando}>
              {reenviando ? 'Enviando...' : 'Reenviar e-mail de confirmação'}
            </button>

            <p className="auth-troca">
              <button type="button" className="auth-link" onClick={voltarParaEntrar}>
                Voltar para entrar
              </button>
            </p>
          </div>
        ) : (
          <>
        <h1 id="auth-titulo">{cadastro ? 'Criar conta' : 'Entrar'}</h1>
        <p className="auth-sub">
          {cadastro
            ? 'Cadastre-se para acompanhar sua casa.'
            : 'Acesse o painel da sua casa inteligente.'}
        </p>

        {aviso && (
          <p
            className={aviso.tipo === 'ok' ? 'auth-aviso-ok' : 'auth-erro-geral'}
            role={aviso.tipo === 'ok' ? 'status' : 'alert'}
          >
            {aviso.texto}
          </p>
        )}

        <form key={modo} className="auth-form" onSubmit={enviar} noValidate>
          {erros.geral && (
            <p className="auth-erro-geral" role="alert">
              {erros.geral}
            </p>
          )}

          {cadastro && (
            <div className="auth-campo meia">
              <label htmlFor="auth-nome">
                Nome
              </label>
              <input
                id="auth-nome"
                type="text"
                autoComplete="off"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                aria-required="true"
                aria-invalid={erros.nome ? true : undefined}
                aria-describedby={erros.nome ? 'auth-nome-erro' : undefined}
              />
              {erros.nome && (
                <span id="auth-nome-erro" className="auth-erro" role="alert">
                  {erros.nome}
                </span>
              )}
            </div>
          )}

          <div className={`auth-campo${cadastro ? ' meia' : ''}`}>
            <label htmlFor="auth-email">
              E-mail
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete={cadastro ? 'off' : 'email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-required="true"
              aria-invalid={erros.email ? true : undefined}
              aria-describedby={erros.email ? 'auth-email-erro' : undefined}
            />
            {erros.email && (
              <span id="auth-email-erro" className="auth-erro" role="alert">
                {erros.email}
              </span>
            )}
          </div>

          {cadastro && (
            <div className="auth-linha">
              <div className="auth-campo">
                <label htmlFor="auth-nascimento">
                  Nascimento
                </label>
                <input
                  id="auth-nascimento"
                  type="date"
                  max={hojeISO()}
                  autoComplete="off"
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                  aria-required="true"
                  aria-invalid={erros.dataNascimento ? true : undefined}
                  aria-describedby={erros.dataNascimento ? 'auth-nascimento-erro' : undefined}
                />
                {erros.dataNascimento && (
                  <span id="auth-nascimento-erro" className="auth-erro" role="alert">
                    {erros.dataNascimento}
                  </span>
                )}
              </div>

              <div className="auth-campo">
                <label htmlFor="auth-genero">
                  Gênero
                </label>
                <select
                  id="auth-genero"
                  autoComplete="off"
                  value={genero}
                  onChange={(e) => setGenero(e.target.value)}
                  aria-required="true"
                  aria-invalid={erros.genero ? true : undefined}
                  aria-describedby={erros.genero ? 'auth-genero-erro' : undefined}
                >
                  <option value="">Selecione</option>
                  {GENEROS.map(([valor, nomeGenero]) => (
                    <option key={valor} value={valor}>
                      {nomeGenero}
                    </option>
                  ))}
                </select>
                {erros.genero && (
                  <span id="auth-genero-erro" className="auth-erro" role="alert">
                    {erros.genero}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className={`auth-campo${cadastro ? ' meia' : ''}`}>
            <label htmlFor="auth-senha">
              Senha
            </label>
            <div className="auth-senha">
              <input
                id="auth-senha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete={cadastro ? 'new-password' : 'current-password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                aria-required="true"
                aria-invalid={erros.senha ? true : undefined}
                aria-describedby={erros.senha ? 'auth-senha-erro' : undefined}
              />
              <button
                type="button"
                className="auth-mostrar"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-pressed={mostrarSenha}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <IconeOlhoCortado /> : <IconeOlho />}
              </button>
            </div>
            {cadastro && !erros.senha && (
              <span className="auth-dica">Mínimo de 8 caracteres.</span>
            )}
            {erros.senha && (
              <span id="auth-senha-erro" className="auth-erro" role="alert">
                {erros.senha}
              </span>
            )}
          </div>

          {cadastro && (
            <div className="auth-campo meia">
              <label htmlFor="auth-confirmar">
                Confirmar senha
              </label>
              <div className="auth-senha">
                <input
                  id="auth-confirmar"
                  type={mostrarConfirmar ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  aria-required="true"
                  aria-invalid={erros.confirmar ? true : undefined}
                  aria-describedby={erros.confirmar ? 'auth-confirmar-erro' : undefined}
                />
                <button
                  type="button"
                  className="auth-mostrar"
                  onClick={() => setMostrarConfirmar((v) => !v)}
                  aria-pressed={mostrarConfirmar}
                  aria-label={mostrarConfirmar ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                  title={mostrarConfirmar ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                >
                  {mostrarConfirmar ? <IconeOlhoCortado /> : <IconeOlho />}
                </button>
              </div>
              {erros.confirmar && (
                <span id="auth-confirmar-erro" className="auth-erro" role="alert">
                  {erros.confirmar}
                </span>
              )}
            </div>
          )}


          <button type="submit" className="auth-enviar" disabled={enviando}>
            {enviando ? 'Aguarde...' : cadastro ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <Sociais cadastro={cadastro} onGoogle={entrarComGoogle} />

        <p className="auth-troca">
          {cadastro ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
          <button
            type="button"
            className="auth-link"
            onClick={() => trocarModo(cadastro ? 'login' : 'cadastro')}
          >
            {cadastro ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
          </>
        )}
      </section>

      <footer className="auth-rodape">CORE FIX Intelligence © 2026</footer>
    </main>
  )
}

export default Login