import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import './Chatbot.css'
import { apiFetch } from './api'

type Mensagem = {
  tipo: 'usuario' | 'bot'
  texto: string
  detalhes?: string[]
}

type RespostaChatbot = {
  sistema?: string
  intencao?: string
  resposta?: string
  aguardando_informacoes?: boolean
  campos_faltando?: string[]
  analise?: { classificacao?: string; confianca?: number }
  erro?: string
}

// Nomes amigáveis das intenções reconhecidas pelo NLU (Python)
const NOMES_INTENCAO: Record<string, string> = {
  consultar_consumo: 'Consultar consumo de energia',
  consultar_sensores: 'Consultar sensores',
  consultar_alertas: 'Consultar alertas',
  consultar_suspeitas: 'Consultar comportamentos suspeitos',
  analisar_evento: 'Analisar evento (Machine Learning)',
}

const MENSAGEM_INICIAL: Mensagem = {
  tipo: 'bot',
  texto:
    'Olá! Sou o CORE FIX Assistant. Posso consultar sensores, consumo de energia, alertas e analisar comportamentos suspeitos da sua residência.',
}

function Chatbot() {
  const [aberto, setAberto] = useState(false)
  const [pergunta, setPergunta] = useState('')
  const [carregando, setCarregando] = useState(false)

  // Referências para rolar a conversa, focar o campo e devolver o foco ao botão
  const mensagensRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLInputElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

  const [mensagens, setMensagens] = useState<Mensagem[]>([MENSAGEM_INICIAL])
  const [sugestoesAbertas, setSugestoesAbertas] = useState(true)

  // Sempre mostra a mensagem mais recente (Nielsen #1: visibilidade do status)
  useEffect(() => {
    const area = mensagensRef.current
    if (area) area.scrollTop = area.scrollHeight
  }, [mensagens, carregando, aberto])

  // Ao abrir o assistente, o cursor já fica no campo de pergunta
  useEffect(() => {
    if (aberto) campoRef.current?.focus()
  }, [aberto])

  // Nova conversa: volta ao início (Nielsen #3: controle e liberdade)
  function limparConversa() {
    setMensagens([MENSAGEM_INICIAL])
    setPergunta('')
    setSugestoesAbertas(true)
    campoRef.current?.focus()
  }

  // Tecla Esc fecha o assistente (Nielsen #3: controle e liberdade)
  function aoPressionarTecla(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      setAberto(false)
      botaoRef.current?.focus()
    }
  }

  async function enviarMensagem(
    e?: FormEvent<HTMLFormElement>,
    textoAlternativo?: string
  ) {
    e?.preventDefault()

    const texto = (textoAlternativo ?? pergunta).trim()

    if (!texto || carregando) return

    // Capturar as últimas 10 mensagens anteriores
    const historico = mensagens
      .slice(-10)
      .map((mensagem) => ({
        tipo: mensagem.tipo,
        texto: mensagem.texto,
      }))

    // Adicionar mensagem atual do usuário à interface
    setMensagens((anterior) => [
      ...anterior,
      { tipo: 'usuario', texto },
    ])

    setPergunta('')
    setSugestoesAbertas(false)
    setCarregando(true)

    try {
      const response = await apiFetch('/api/chatbot', {
        method: 'POST',
        body: JSON.stringify({
          pergunta: texto,
          historico,
        }),
      })

      const data: RespostaChatbot = await response.json()

      if (!response.ok) {
        throw new Error(
          data.erro || 'Não foi possível obter uma resposta do servidor.'
        )
      }

      // Transparência da IA: mostra o que o sistema entendeu (Nielsen #1)
      const detalhes: string[] = []

      const nomeIntencao = data.intencao && NOMES_INTENCAO[data.intencao]
      if (nomeIntencao) detalhes.push(`Entendi: ${nomeIntencao}`)

      if (data.analise?.classificacao) {
        const conf =
          typeof data.analise.confianca === 'number'
            ? ` (confiança ${Math.round(
                data.analise.confianca <= 1
                  ? data.analise.confianca * 100
                  : data.analise.confianca,
              )}%)`
            : ''
        detalhes.push(`Classificação: ${data.analise.classificacao}${conf}`)
      }

      if (data.campos_faltando?.length) {
        detalhes.push(
          `Informações necessárias: ${data.campos_faltando.join(', ')}`,
        )
      }

      setMensagens((anterior) => [
        ...anterior,
        {
          tipo: 'bot',
          texto: data.resposta || 'Não encontrei uma resposta.',
          detalhes,
        },
      ])
    } catch (error) {
      setMensagens((anterior) => [
        ...anterior,
        {
          tipo: 'bot',
          texto:
            error instanceof Error
              ? error.message
              : 'Erro ao conectar com o servidor.',
        },
      ])
    } finally {
      setCarregando(false)
    }
  }

  const sugestoes = [
    'Existem alertas na minha casa?',
    'Quais sensores estão ativos?',
    'Existe comportamento suspeito?',
    'Qual é o consumo de energia?',
    'A porta foi aberta às 23 horas e não tem ninguém em casa',
  ]

  return (
    <div className="chatbot-container">
      {aberto && (
        <section
          className="chatbot-window"
          id="chatbot-janela"
          role="dialog"
          aria-labelledby="chatbot-titulo"
          onKeyDown={aoPressionarTecla}
        >
          <header className="chatbot-header">
            <div className="chatbot-avatar" aria-hidden="true">
              CF
            </div>

            <div className="chatbot-header-info">
              <strong id="chatbot-titulo">CORE FIX Assistant</strong>
              <span>
                <i aria-hidden="true" /> Assistente da Smart Home
              </span>
            </div>

            <button
              type="button"
              className="chatbot-reset"
              onClick={limparConversa}
              disabled={carregando || mensagens.length <= 1}
              aria-label="Nova conversa"
              title="Nova conversa"
            >
              <span aria-hidden="true">↺</span>
            </button>

            <button
              type="button"
              className="chatbot-close"
              onClick={() => {
                setAberto(false)
                botaoRef.current?.focus()
              }}
              aria-label="Fechar assistente"
              title="Fechar (Esc)"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div
            className="chatbot-messages"
            ref={mensagensRef}
            role="log"
            aria-live="polite"
            aria-label="Conversa com o assistente"
          >
            {mensagens.map((mensagem, index) => (
              <div key={index}>
                <div className={`chat-message ${mensagem.tipo}`}>
                  {mensagem.texto}
                </div>

                {mensagem.detalhes?.map((detalhe, i) => (
                  <div className="chat-message bot" key={i}>
                    {detalhe}
                  </div>
                ))}
              </div>
            ))}

            {carregando && (
              <div className="chat-message bot typing" role="status">
                Analisando sua solicitação...
              </div>
            )}
          </div>

          {/* Depois da 1ª pergunta, as sugestões ficam recolhidas (Lei de Hick) */}
          {mensagens.length > 1 && (
            <button
              type="button"
              className="chatbot-suggestions-toggle"
              onClick={() => setSugestoesAbertas((aberta) => !aberta)}
              aria-expanded={sugestoesAbertas}
              aria-controls="chatbot-sugestoes"
            >
              {sugestoesAbertas
                ? 'Ocultar sugestões'
                : 'Ver sugestões de perguntas'}
            </button>
          )}

          {sugestoesAbertas && (
            <div
              className="chatbot-suggestions"
              id="chatbot-sugestoes"
              role="group"
              aria-label="Sugestões de perguntas"
            >
              {sugestoes.map((sugestao) => (
                <button
                  type="button"
                  key={sugestao}
                  disabled={carregando}
                  onClick={() => enviarMensagem(undefined, sugestao)}
                >
                  {sugestao}
                </button>
              ))}
            </div>
          )}

          <form className="chatbot-form" onSubmit={enviarMensagem}>
            <label htmlFor="chatbot-pergunta" className="sr-only">
              Digite sua pergunta
            </label>
            <input
              id="chatbot-pergunta"
              ref={campoRef}
              type="text"
              placeholder="Digite sua pergunta..."
              autoComplete="off"
              maxLength={300}
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              disabled={carregando}
            />

            <button
              type="submit"
              disabled={carregando || !pergunta.trim()}
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              <span aria-hidden="true">➤</span>
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="chatbot-toggle"
        ref={botaoRef}
        onClick={() => setAberto((anterior) => !anterior)}
        aria-label={aberto ? 'Fechar assistente' : 'Abrir assistente'}
        aria-expanded={aberto}
        aria-controls="chatbot-janela"
        title={aberto ? 'Fechar assistente' : 'Abrir assistente'}
      >
        <span aria-hidden="true">{aberto ? '×' : '✧'}</span>
      </button>
    </div>
  )
}

export default Chatbot
