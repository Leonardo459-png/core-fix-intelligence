import { useEffect, useRef, useState } from 'react'
import { API_URL } from './api'

// ID do cliente criado no Google Cloud (arquivo frontend/.env: VITE_GOOGLE_CLIENT_ID=...)
const GOOGLE_CLIENT_ID = (
  import.meta as unknown as { env: Record<string, string | undefined> }
).env.VITE_GOOGLE_CLIENT_ID

type GoogleGlobal = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (resposta: { credential: string }) => void
      }) => void
      renderButton: (
        elemento: HTMLElement,
        opcoes: Record<string, string | number>,
      ) => void
    }
  }
}

function obterGoogle(): GoogleGlobal | undefined {
  return (window as unknown as { google?: GoogleGlobal }).google
}

// Carrega a biblioteca oficial do Google uma única vez
function carregarGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (obterGoogle()) return resolve()

    const existente = document.getElementById('google-gsi')
    if (existente) {
      existente.addEventListener('load', () => resolve())
      return
    }

    const script = document.createElement('script')
    script.id = 'google-gsi'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Falha ao carregar o Google'))
    document.head.appendChild(script)
  })
}

function IconeGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function IconeGithub() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  )
}

type Props = {
  // true quando a tela está no modo "Criar conta" (muda só o texto do botão do Google)
  cadastro: boolean
  // Recebe o ID token do Google; deve lançar erro se o servidor recusar
  onGoogle: (credencial: string) => Promise<void>
}

// Botões "continuar com Google / Apple", usados no login e no cadastro
function Sociais({ cadastro, onGoogle }: Props) {
  const googleRef = useRef<HTMLDivElement>(null)
  const [aviso, setAviso] = useState('')
  const configurado = Boolean(GOOGLE_CLIENT_ID)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleRef.current) return

    let cancelado = false
    const alvo = googleRef.current

    carregarGoogle()
      .then(() => {
        const google = obterGoogle()
        if (cancelado || !google) return

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resposta) => {
            setAviso('')
            onGoogle(resposta.credential).catch((erro: unknown) =>
              setAviso(
                erro instanceof Error
                  ? erro.message
                  : 'Não foi possível entrar com o Google.',
              ),
            )
          },
        })

        alvo.innerHTML = ''
        google.accounts.id.renderButton(alvo, {
          theme: 'filled_black',
          size: 'large',
          text: cadastro ? 'signup_with' : 'continue_with',
          shape: 'rectangular',
          // O botão oficial do Google aceita de 200 a 400 px; acompanha a largura do card
          width: Math.max(200, Math.min(400, Math.floor(alvo.clientWidth || 350))),
          locale: 'pt-BR',
        })
      })
      .catch(() =>
        setAviso('Não foi possível carregar o login do Google. Verifique sua conexão.'),
      )

    return () => {
      cancelado = true
    }
    // onGoogle muda a cada renderização do Login; só reconfiguramos ao trocar de modo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadastro])

  return (
    <div className="auth-sociais">
      <p className="auth-divisor">
        <span>ou {cadastro ? 'cadastre-se' : 'continue'} com</span>
      </p>

      {configurado ? (
        <div className="auth-google-wrap">
          {/* Visual igual ao botão da Apple; o botão oficial do Google fica por cima, invisível, e recebe o clique */}
          <div className="auth-social" aria-hidden="true">
            <IconeGoogle />
            {cadastro ? 'Cadastrar com Google' : 'Continuar com Google'}
          </div>
          <div ref={googleRef} className="auth-google-oficial" />
        </div>
      ) : (
        <button
          type="button"
          className="auth-social"
          onClick={() =>
            setAviso('O login com Google ainda não está configurado neste ambiente.')
          }
        >
          <IconeGoogle />
          {cadastro ? 'Cadastrar com Google' : 'Continuar com Google'}
        </button>
      )}

      <button
        type="button"
        className="auth-social github"
        onClick={() => {
          // O GitHub pede a autorização e devolve a pessoa para o sistema já logada
          window.location.href = `${API_URL}/api/auth/github`
        }}
      >
        <IconeGithub />
        {cadastro ? 'Cadastrar com GitHub' : 'Continuar com GitHub'}
      </button>

      {aviso && (
        <p className="auth-aviso-social" role="status">
          {aviso}
        </p>
      )}
    </div>
  )
}

export default Sociais
