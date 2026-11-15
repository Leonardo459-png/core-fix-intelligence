import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import './App.css'
import Chatbot from './Chatbot'
import Login from './Login'
import Admin from './Admin'
import Perfil from './Perfil'
import {
  API_URL,
  apiFetch,
  apiJson,
  limparToken,
  obterToken,
  type Usuario,
} from './api'

type Evento = {
  hora: number
  movimento: number
  porta_aberta: number
  consumo_energia: number
  presenca_morador: number
}

type Resultado = {
  sistema?: string
  classificacao?: string
  suspeito?: boolean
  confianca?: number
  probabilidades?: {
    normal?: number
    suspeito?: number
  }
  recomendacao?: string
  aprovacao_manual_necessaria?: boolean
  erro?: string
  evento_id?: number
}

type Sensor = {
  id: number
  usuario_id: number | null
  nome: string
  tipo: string
  ambiente: string | null
  status: string
  valor_atual: number | null
  unidade: string | null
  ultima_atividade: string | null
  criado_em: string
}

type FormularioSensor = {
  nome: string
  tipo: string
  ambiente: string
  status: string
  valor_atual: string
  unidade: string
}

type Conexao = {
  backend: boolean
  inteligencia: boolean
}

const eventoInicial: Evento = {
  hora: 23,
  movimento: 1,
  porta_aberta: 1,
  consumo_energia: 0,
  presenca_morador: 1,
}

type AtividadeDia = { dia: string; total: number; suspeitos: number }

const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function rotuloDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  return nomesDias[new Date(a, m - 1, d).getDay()]
}

const formularioInicial: FormularioSensor = {
  nome: '',
  tipo: 'movimento',
  ambiente: '',
  status: 'ativo',
  valor_atual: '0',
  unidade: 'estado',
}

type MetricCardProps = {
  titulo: string
  icone: string
  cor: 'blue' | 'purple' | 'green' | 'orange'
  valor: ReactNode
  descricao: ReactNode
}

// Card de indicador reutilizável (princípio DRY: eram 12 blocos repetidos)
function MetricCard({ titulo, icone, cor, valor, descricao }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{titulo}</span>
        <span className={`metric-icon ${cor}`} aria-hidden="true">
          {icone}
        </span>
      </div>
      <strong className="metric-value">{valor}</strong>
      <span className="metric-description">{descricao}</span>
    </article>
  )
}

// Painel principal: só é exibido depois do login
function Painel({
  usuario,
  onSair,
  onUsuarioAtualizado,
}: {
  usuario: Usuario
  onSair: () => void
  onUsuarioAtualizado: (u: Usuario) => void
}) {
  const ehAdmin = usuario.papel === 'admin'
  const [pagina, setPagina] = useState('Visão geral')
  const [verificando, setVerificando] = useState(true)

  const [conexao, setConexao] = useState<Conexao>({
    backend: false,
    inteligencia: false,
  })

  const [evento, setEvento] = useState<Evento>(eventoInicial)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [historico, setHistorico] = useState<Resultado[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [ultimaVerificacao, setUltimaVerificacao] = useState('Aguardando...')

  // Sensores do PostgreSQL
  const [sensores, setSensores] = useState<Sensor[]>([])
  const [atividade, setAtividade] = useState<AtividadeDia[]>([])

  // Busca, filtros e ordenação da lista de sensores
  const [buscaSensor, setBuscaSensor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [ordemSensor, setOrdemSensor] = useState('nome')
  // Lista exibida: filtra por texto, status e tipo; depois ordena
  const termoSensor = buscaSensor.trim().toLowerCase()
  const tiposSensor = Array.from(new Set(sensores.map((x) => x.tipo))).sort()
  const sensoresVisiveis = sensores
    .filter((x) =>
      `${x.nome} ${x.ambiente ?? ''}`.toLowerCase().includes(termoSensor),
    )
    .filter(
      (x) =>
        filtroStatus === 'todos' ||
        x.status?.toLowerCase() === filtroStatus,
    )
    .filter((x) => filtroTipo === 'todos' || x.tipo === filtroTipo)
    .sort((x, y) => {
      if (ordemSensor === 'valor')
        return Number(y.valor_atual ?? 0) - Number(x.valor_atual ?? 0)
      if (ordemSensor === 'status') return x.status.localeCompare(y.status)
      if (ordemSensor === 'recentes') return y.id - x.id
      return x.nome.localeCompare(y.nome, 'pt-BR')
    })

  // Consumo real: soma dos sensores de energia do próprio usuário
  const sensoresEnergia = sensores.filter((x) => x.tipo === 'energia')
  const totalEnergia = sensoresEnergia.reduce(
    (soma, x) => soma + Number(x.valor_atual ?? 0),
    0,
  )
  const maxAtividade = Math.max(1, ...atividade.map((d) => d.total))
  const [carregandoSensores, setCarregandoSensores] = useState(false)
  const [erroSensores, setErroSensores] = useState('')
  const [modalSensor, setModalSensor] = useState(false)
  const [sensorEditando, setSensorEditando] = useState<number | null>(null)
  const [salvandoSensor, setSalvandoSensor] = useState(false)
  const [formSensor, setFormSensor] =
    useState<FormularioSensor>(formularioInicial)

  // Verificação do backend e da inteligência
  async function verificarConexao() {
    try {
      const response = await fetch(`${API_URL}/api/health`)

      // O backend responde 503 (com JSON) quando só a inteligência está fora;
      // por isso lemos o corpo mesmo com status de erro.
      const data = await response.json()

      setConexao({
        backend: data.backend === 'online',
        inteligencia: data.inteligencia?.status === 'healthy',
      })

      setUltimaVerificacao(new Date().toLocaleTimeString('pt-BR'))
    } catch {
      setConexao({ backend: false, inteligencia: false })
      setUltimaVerificacao(new Date().toLocaleTimeString('pt-BR'))
    } finally {
      setVerificando(false)
    }
  }

  // Análises feitas nos últimos 7 dias (dados reais do usuário)
  async function carregarAtividade() {
    try {
      const response = await apiFetch('/api/perfil/atividade')
      if (response.ok) setAtividade(await response.json())
    } catch {
      setAtividade([])
    }
  }

  // Buscar sensores no banco
  async function carregarSensores() {
    setCarregandoSensores(true)
    setErroSensores('')

    try {
      const response = await apiFetch('/api/sensores')

      if (!response.ok) {
        throw new Error('Não foi possível consultar os sensores.')
      }

      const data = await response.json()

      // Aceita tanto uma lista direta quanto o objeto
      // { total_sensores: ..., sensores: [...] }
      const lista: Sensor[] = Array.isArray(data)
        ? data
        : Array.isArray(data.sensores)
          ? data.sensores
          : []

      setSensores(lista)
    } catch (error) {
      setErroSensores(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar sensores.',
      )
    } finally {
      setCarregandoSensores(false)
    }
  }

  useEffect(() => {
    verificarConexao()
    carregarSensores()
    carregarAtividade()

    const intervalo = window.setInterval(verificarConexao, 10000)

    return () => window.clearInterval(intervalo)
  }, [])

  // Título da aba muda conforme a página (SEO e orientação do usuário)
  useEffect(() => {
    document.title = `${pagina} · CORE FIX Intelligence`
  }, [pagina])

  // Atualização dos campos da análise
  function atualizarEvento(campo: keyof Evento, valor: number) {
    setEvento((anterior) => ({
      ...anterior,
      [campo]: valor,
    }))
  }

  // Análise de Machine Learning
  async function analisarEvento(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setCarregando(true)
    setErro('')
    setResultado(null)

    try {
      const response = await apiFetch('/api/analisar-evento', {
        method: 'POST',
        body: JSON.stringify(evento),
      })

      const data: Resultado = await response.json()

      if (!response.ok) {
        throw new Error(data.erro || 'Não foi possível analisar o evento.')
      }

      setResultado(data)
      setHistorico((anterior) => [data, ...anterior].slice(0, 50))
      carregarAtividade()
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : 'Erro ao conectar com a inteligência artificial.',
      )
    } finally {
      setCarregando(false)
    }
  }

  // Leva a tela até o formulário de sensor (feedback visual ao usuário)
  function rolarParaFormulario() {
    window.setTimeout(() => {
      document
        .getElementById('form-sensor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  // Abrir formulário para cadastrar
  function abrirCadastroSensor() {
    setSensorEditando(null)
    setFormSensor({ ...formularioInicial })
    setErroSensores('')
    setModalSensor(true)
    rolarParaFormulario()
  }

  // Abrir formulário para editar
  function abrirEdicaoSensor(sensor: Sensor) {
    setSensorEditando(sensor.id)

    setFormSensor({
      nome: sensor.nome,
      tipo: sensor.tipo,
      ambiente: sensor.ambiente || '',
      status: sensor.status,
      valor_atual: String(sensor.valor_atual ?? 0),
      unidade: sensor.unidade || 'estado',
    })

    setErroSensores('')
    setModalSensor(true)
    rolarParaFormulario()
  }

  // Cadastrar ou atualizar sensor
  async function salvarSensor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (salvandoSensor) return

    setSalvandoSensor(true)
    setErroSensores('')

    const metodo = sensorEditando !== null ? 'PUT' : 'POST'

    const url =
      sensorEditando !== null
        ? `/api/sensores/${sensorEditando}`
        : '/api/sensores'

    try {
      const response = await apiFetch(url, {
        method: metodo,
        body: JSON.stringify({
          usuario_id: usuario.id,
          nome: formSensor.nome.trim(),
          tipo: formSensor.tipo,
          ambiente: formSensor.ambiente.trim(),
          status: formSensor.status,
          valor_atual: Number(formSensor.valor_atual),
          unidade: formSensor.unidade.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.erro || data.mensagem || 'Não foi possível salvar o sensor.',
        )
      }

      setModalSensor(false)
      setSensorEditando(null)
      setFormSensor({ ...formularioInicial })

      await carregarSensores()
    } catch (error) {
      setErroSensores(
        error instanceof Error ? error.message : 'Erro ao salvar sensor.',
      )
    } finally {
      setSalvandoSensor(false)
    }
  }

  // Excluir sensor
  async function excluirSensor(id: number) {
    const confirmar = window.confirm(
      'Tem certeza de que deseja excluir este sensor?',
    )

    if (!confirmar) return

    setErroSensores('')

    try {
      const response = await apiFetch(`/api/sensores/${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.erro || data.mensagem || 'Não foi possível excluir o sensor.',
        )
      }

      await carregarSensores()
    } catch (error) {
      setErroSensores(
        error instanceof Error ? error.message : 'Erro ao excluir sensor.',
      )
    }
  }

  const operacional = conexao.backend && conexao.inteligencia

  const statusGeral = verificando
    ? 'Verificando conexão'
    : operacional
      ? 'Operacional'
      : conexao.backend
        ? 'Inteligência offline'
        : 'Sistema offline'

  const classeStatus = verificando ? 'checking' : operacional ? '' : 'offline'

  const totalSuspeitos = historico.filter((item) => item.suspeito).length

  const sensoresAtivos = sensores.filter(
    (sensor) => sensor.status?.toLowerCase() === 'ativo',
  ).length

  const sensoresInativos = sensores.length - sensoresAtivos

  function renderBoasVindas() {
    return (
      <section className="welcome-banner" aria-labelledby="titulo-boas-vindas">
        <div>
          <span className="eyebrow">SMART HOME INTELLIGENCE</span>
          <h2 id="titulo-boas-vindas">O futuro da sua casa começa agora.</h2>
          <p>
            Monitore atividades, identifique comportamentos incomuns e utilize
            inteligência artificial para tomar decisões melhores.
          </p>
        </div>
        <div className="banner-symbol" aria-hidden="true">
          ⌂
        </div>
      </section>
    )
  }

  // Tela de inteligência
  function renderAnalise() {
    return (
      <>
        <div className="section-heading analysis-heading">
          <div>
            <h2>Central de inteligência</h2>
            <p>
              Envie informações dos sensores para análise do modelo de Machine
              Learning.
            </p>
          </div>
        </div>

        <div className="dashboard-grid analysis-grid">
          <section className="panel analysis-panel">
            <div className="panel-heading">
              <div>
                <h3>Analisar evento da residência</h3>
                <p>Preencha os dados para executar o modelo.</p>
              </div>
              <span className="ai-tag">ML ATIVO</span>
            </div>

            <form onSubmit={analisarEvento}>
              <p className="nota-obrigatorio">
                <span aria-hidden="true">*</span> Campo obrigatório
              </p>

              <div className="form-grid">
                <label>
                  <span className="campo-rotulo">Horário do evento <span className="obrigatorio" aria-hidden="true">*</span></span>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    step="1"
                    value={evento.hora}
                    onChange={(e) =>
                      atualizarEvento('hora', Number(e.target.value))
                    }
                    required
                  />
                  <small>0 a 23 horas</small>
                </label>

                <label>
                  <span className="campo-rotulo">Movimento detectado</span>
                  <select
                    value={evento.movimento}
                    onChange={(e) =>
                      atualizarEvento('movimento', Number(e.target.value))
                    }
                  >
                    <option value={0}>Não</option>
                    <option value={1}>Sim</option>
                  </select>
                  <small>Sensor de movimento no momento do evento</small>
                </label>

                <label>
                  <span className="campo-rotulo">Porta aberta</span>
                  <select
                    value={evento.porta_aberta}
                    onChange={(e) =>
                      atualizarEvento('porta_aberta', Number(e.target.value))
                    }
                  >
                    <option value={0}>Não</option>
                    <option value={1}>Sim</option>
                  </select>
                  <small>Estado da porta de entrada</small>
                </label>

                <label>
                  <span className="campo-rotulo">Consumo de energia <span className="obrigatorio" aria-hidden="true">*</span></span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={evento.consumo_energia}
                    onChange={(e) =>
                      atualizarEvento(
                        'consumo_energia',
                        Number(e.target.value),
                      )
                    }
                    required
                  />
                  <small>Valor numérico do sensor</small>
                </label>

                <label className="full-field">
                  <span className="campo-rotulo">Presença do morador</span>
                  <select
                    value={evento.presenca_morador}
                    onChange={(e) =>
                      atualizarEvento(
                        'presenca_morador',
                        Number(e.target.value),
                      )
                    }
                  >
                    <option value={0}>Ausente</option>
                    <option value={1}>Presente</option>
                  </select>
                  <small>Se havia alguém da casa no momento do evento</small>
                </label>
              </div>

              <button
                className="analyze-button"
                type="submit"
                disabled={carregando}
              >
                {carregando
                  ? 'Analisando evento...'
                  : '⌁ Analisar com Machine Learning'}
              </button>

              {erro && <div className="error-message" role="alert">{erro}</div>}
            </form>
          </section>

          <section className="panel result-panel">
            <div className="panel-heading">
              <div>
                <h3>Resultado da inteligência</h3>
                <p>Retorno do modelo Python</p>
              </div>
              <span className="result-icon" aria-hidden="true">✧</span>
            </div>

            {resultado ? (
              <div className="result-content">
                <span
                  className={`result-class ${
                    resultado.suspeito ? 'suspicious' : 'normal'
                  }`}
                >
                  {resultado.classificacao || 'Analisado'}
                </span>

                <div className="confidence">
                  <span>Confiança do modelo</span>
                  <strong>{resultado.confianca ?? 0}%</strong>
                </div>

                <div className="confidence-track">
                  <div
                    className="confidence-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, resultado.confianca ?? 0),
                      )}%`,
                    }}
                  />
                </div>

                <div className="probability-row">
                  <span>Normal</span>
                  <strong>{resultado.probabilidades?.normal ?? 0}%</strong>
                </div>

                <div className="probability-row">
                  <span>Suspeito</span>
                  <strong>{resultado.probabilidades?.suspeito ?? 0}%</strong>
                </div>

                <div className="recommendation">
                  <strong>Recomendação</strong>
                  <p>
                    {resultado.recomendacao ||
                      'Nenhuma recomendação disponível.'}
                  </p>
                </div>

                {resultado.aprovacao_manual_necessaria && (
                  <div className="manual-warning">
                    ⚠️ Este evento exige verificação manual.
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-result">
                <div className="empty-symbol" aria-hidden="true">✧</div>
                <strong>Aguardando análise</strong>
                <p>
                  Preencha os dados dos sensores e clique em analisar para
                  visualizar o resultado do modelo.
                </p>
              </div>
            )}
          </section>
        </div>
      </>
    )
  }

  // Tela de sensores conectada ao banco
  function renderSensores() {
    return (
      <>
        {renderBoasVindas()}

        <div className="section-heading">
          <div>
            <h2>Sensores da residência</h2>
            <p>Gerenciamento dos dispositivos cadastrados no PostgreSQL.</p>
          </div>

          <button
            className="analyze-button"
            type="button"
            onClick={abrirCadastroSensor}
          >
            + Cadastrar sensor
          </button>
        </div>

        <div className="metrics-grid">
          <MetricCard
            titulo="Total de sensores"
            icone="◉"
            cor="blue"
            valor={sensores.length}
            descricao={<>Registrados no banco</>}
          />

          <MetricCard
            titulo="Sensores ativos"
            icone="✓"
            cor="green"
            valor={sensoresAtivos}
            descricao={<>Status ativo</>}
          />

          <MetricCard
            titulo="Sensores inativos"
            icone="!"
            cor="orange"
            valor={sensoresInativos}
            descricao={<>Status diferente de ativo</>}
          />

          <MetricCard
            titulo="Eventos analisados"
            icone="⌁"
            cor="purple"
            valor={historico.length}
            descricao={<>Nesta sessão</>}
          />
        </div>

        <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <h3>Dispositivos cadastrados</h3>
              <p>Dados consultados diretamente no PostgreSQL.</p>
            </div>

            <button
              className="refresh-button"
              type="button"
              onClick={carregarSensores}
              disabled={carregandoSensores}
              title="Atualizar lista"
              aria-label="Atualizar lista de sensores"
            >
              ↻
            </button>
          </div>

          {sensores.length > 0 && (
            <div className="sensor-filtros">
              <div className="sensor-filtro sensor-filtro-busca">
                <label htmlFor="busca-sensor">Buscar</label>
                <input
                  id="busca-sensor"
                  type="search"
                  placeholder="Nome ou ambiente"
                  value={buscaSensor}
                  onChange={(e) => setBuscaSensor(e.target.value)}
                />
              </div>

              <div className="sensor-filtro">
                <label htmlFor="filtro-status">Status</label>
                <select
                  id="filtro-status"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div className="sensor-filtro">
                <label htmlFor="filtro-tipo">Tipo</label>
                <select
                  id="filtro-tipo"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  {tiposSensor.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="sensor-filtro">
                <label htmlFor="ordem-sensor">Ordenar por</label>
                <select
                  id="ordem-sensor"
                  value={ordemSensor}
                  onChange={(e) => setOrdemSensor(e.target.value)}
                >
                  <option value="nome">Nome (A–Z)</option>
                  <option value="valor">Maior valor</option>
                  <option value="status">Status</option>
                  <option value="recentes">Mais recentes</option>
                </select>
              </div>
            </div>
          )}

          {erroSensores && (
            <div className="error-message" role="alert">{erroSensores}</div>
          )}

          {carregandoSensores ? (
            <div className="history-empty">Carregando sensores...</div>
          ) : sensores.length > 0 && sensoresVisiveis.length === 0 ? (
            <div className="history-empty">
              Nenhum sensor encontrado para esses filtros.
            </div>
          ) : sensores.length > 0 ? (
            <div className="history-list">
              {sensoresVisiveis.map((sensor) => (
                <div className="history-row" key={sensor.id}>
                  <span className="metric-icon blue" aria-hidden="true">◉</span>

                  <div className="history-info">
                    <strong>{sensor.nome}</strong>
                    <small>
                      {sensor.ambiente || 'Ambiente não informado'} •{' '}
                      {sensor.tipo}
                    </small>
                    <small>
                      Valor: {sensor.valor_atual ?? '--'}{' '}
                      {sensor.unidade || ''}
                    </small>
                  </div>

                  <span
                    className={`system-status ${
                      sensor.status?.toLowerCase() === 'ativo'
                        ? 'online'
                        : 'offline'
                    }`}
                  >
                    {sensor.status}
                  </span>

                  <button
                    className="refresh-button"
                    type="button"
                    onClick={() => abrirEdicaoSensor(sensor)}
                    title="Editar sensor"
                    aria-label={`Editar sensor ${sensor.nome}`}
                  >
                    ✎
                  </button>

                  <button
                    className="refresh-button"
                    type="button"
                    onClick={() => excluirSensor(sensor.id)}
                    title="Excluir sensor"
                    aria-label={`Excluir sensor ${sensor.nome}`}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="history-empty">
              Nenhum sensor cadastrado no banco de dados.
            </div>
          )}
        </section>

        {modalSensor && (
          <section
            className="panel"
            id="form-sensor"
            aria-labelledby="titulo-form-sensor"
          >
            <div className="panel-heading">
              <div>
                <h3 id="titulo-form-sensor">
                  {sensorEditando !== null
                    ? 'Editar sensor'
                    : 'Cadastrar novo sensor'}
                </h3>
                <p>Informe os dados do dispositivo.</p>
              </div>
            </div>

            <form onSubmit={salvarSensor}>
              <p className="nota-obrigatorio">
                <span aria-hidden="true">*</span> Campo obrigatório
              </p>

              <div className="form-grid">
                <label>
                  <span className="campo-rotulo">Nome do sensor <span className="obrigatorio" aria-hidden="true">*</span></span>
                  <input
                    autoFocus
                    minLength={2}
                    maxLength={60}
                    value={formSensor.nome}
                    onChange={(e) =>
                      setFormSensor({
                        ...formSensor,
                        nome: e.target.value,
                      })
                    }
                    placeholder="Ex: Sensor da sala"
                    required
                  />
                </label>

                <label>
                  <span className="campo-rotulo">Tipo</span>
                  <select
                    value={formSensor.tipo}
                    onChange={(e) =>
                      setFormSensor({
                        ...formSensor,
                        tipo: e.target.value,
                      })
                    }
                  >
                    <option value="movimento">Movimento</option>
                    <option value="porta">Porta</option>
                    <option value="energia">Energia</option>
                    <option value="presenca">Presença</option>
                    <option value="temperatura">Temperatura</option>
                  </select>
                </label>

                <label>
                  <span className="campo-rotulo">Ambiente</span>
                  <input
                    maxLength={40}
                    value={formSensor.ambiente}
                    onChange={(e) =>
                      setFormSensor({
                        ...formSensor,
                        ambiente: e.target.value,
                      })
                    }
                    placeholder="Ex: Sala"
                  />
                </label>

                <label>
                  <span className="campo-rotulo">Status</span>
                  <select
                    value={formSensor.status}
                    onChange={(e) =>
                      setFormSensor({
                        ...formSensor,
                        status: e.target.value,
                      })
                    }
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="offline">Offline</option>
                  </select>
                </label>

                <label>
                  <span className="campo-rotulo">Valor atual <span className="obrigatorio" aria-hidden="true">*</span></span>
                  <input
                    type="number"
                    step="0.01"
                    value={formSensor.valor_atual}
                    onChange={(e) =>
                      setFormSensor({
                        ...formSensor,
                        valor_atual: e.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label>
                  <span className="campo-rotulo">Unidade</span>
                  <input
                    maxLength={12}
                    value={formSensor.unidade}
                    onChange={(e) =>
                      setFormSensor({
                        ...formSensor,
                        unidade: e.target.value,
                      })
                    }
                    placeholder="Ex: estado, kWh"
                  />
                </label>
              </div>

              {erroSensores && (
                <div className="error-message" role="alert">{erroSensores}</div>
              )}

<div className="sensor-form-actions">
  <button
    className="sensor-save-button"
    type="submit"
    disabled={salvandoSensor}
  >
    {salvandoSensor
      ? 'Salvando...'
      : sensorEditando !== null
        ? 'Salvar alterações'
        : 'Cadastrar sensor'}
  </button>

  <button
    className="sensor-cancel-button"
    type="button"
    onClick={() => {
      setModalSensor(false)
      setSensorEditando(null)
      setErroSensores('')
    }}
  >
    Cancelar
  </button>
</div>
            </form>
          </section>
        )}

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Inteligência da residência</h3>
              <p>
                Os dados dos sensores podem ser utilizados nas análises de
                comportamento.
              </p>
            </div>
          </div>

          <button
            className="analyze-button"
            type="button"
            onClick={() => setPagina('Inteligência')}
          >
            Acessar central de inteligência
          </button>
        </section>
      </>
    )
  }

  // Histórico de análises da sessão
  function renderHistorico() {
    return (
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>Histórico de análises</h2>
            <p>Eventos enviados ao modelo de Machine Learning nesta sessão.</p>
          </div>
          <span className="panel-tag">{historico.length} REGISTROS</span>
        </div>

        {historico.length > 0 ? (
          <div className="history-list">
            {historico.map((item, index) => (
              <div className="history-row" key={`${index}-${item.classificacao}`}>
                <span
                  className={`history-indicator ${
                    item.suspeito ? 'suspicious' : 'normal'
                  }`}
                />

                <div className="history-info">
                  <strong>{item.classificacao || 'Evento analisado'}</strong>
                  <small>
                    {item.recomendacao || 'Sem recomendação registrada.'}
                  </small>
                </div>

                <span className="history-confidence">
                  {item.confianca ?? 0}% confiança
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="history-empty">
            Nenhuma análise realizada ainda.
          </div>
        )}
      </section>
    )
  }

  // Visão geral
  function renderVisaoGeral() {
    return (
      <>
        {renderBoasVindas()}

        <div className="section-heading">
          <div>
            <h2>Visão geral da residência</h2>
            <p>Acompanhe os principais indicadores do ambiente.</p>
          </div>

          <span className="live-label">
            <span className="status-dot" aria-hidden="true" /> AO VIVO
          </span>
        </div>

        <div className="metrics-grid">
          <MetricCard
            titulo="Consumo de energia"
            icone="ϟ"
            cor="blue"
            valor={
              sensoresEnergia.length > 0 ? (
                <>
                  {totalEnergia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{' '}
                  <small>{sensoresEnergia[0].unidade || 'kWh'}</small>
                </>
              ) : (
                '--'
              )
            }
            descricao={
              sensoresEnergia.length > 0
                ? <>Soma de {sensoresEnergia.length} sensor(es) de energia</>
                : <>Nenhum sensor de energia cadastrado</>
            }
          />

          <MetricCard
            titulo="Sensores cadastrados"
            icone="◉"
            cor="purple"
            valor={sensores.length}
            descricao={<>{sensoresAtivos} ativos</>}
          />

          <MetricCard
            titulo="Eventos analisados"
            icone="⌁"
            cor="green"
            valor={historico.length}
            descricao={<>Nesta sessão</>}
          />

          <MetricCard
            titulo="Alertas suspeitos"
            icone="⚑"
            cor="orange"
            valor={totalSuspeitos}
            descricao={<>Nesta sessão</>}
          />
        </div>

        <div className={`dashboard-grid${ehAdmin ? '' : ' dashboard-grid-unico'}`}>
          <section className="panel energy-panel">
            <div className="panel-heading">
              <div>
                <h3>Atividade da semana</h3>
                <p>Análises enviadas ao modelo nos últimos 7 dias</p>
              </div>
              <span className="panel-tag">7 DIAS</span>
            </div>

            <figure className="chart-figure">
              <div
                className="chart"
                role="img"
                aria-label={`Análises por dia: ${atividade
                  .map((d) => `${rotuloDia(d.dia)} ${d.total}`)
                  .join(', ')}`}
              >
                {atividade.map((d) => (
                  <div className="chart-column" key={d.dia}>
                    <div className="chart-bar-area" style={{ flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <strong className="chart-valor" style={{ fontSize: 12, marginBottom: 4, color: '#dbe7ff' }}>
                        {d.total}
                      </strong>
                      <div
                        className="chart-bar"
                        title={`${rotuloDia(d.dia)}: ${d.total} análise(s), ${d.suspeitos} suspeita(s)`}
                        style={{
                          height: `${(d.total / maxAtividade) * 100}%`,
                          minHeight: d.total === 0 ? 3 : undefined,
                          opacity: d.total === 0 ? 0.35 : 1,
                        }}
                      />
                    </div>
                    <span>{rotuloDia(d.dia)}</span>
                  </div>
                ))}
              </div>

              <figcaption className="chart-note">
                <span className="chart-legend" aria-hidden="true" />
                {atividade.every((d) => d.total === 0)
                  ? 'Nenhuma análise ainda — envie um evento na tela Inteligência.'
                  : 'Dados reais: análises feitas por você.'}
              </figcaption>
            </figure>
          </section>

          {/* Status técnico dos serviços: só interessa a quem administra o sistema */}
          {ehAdmin && (
            <section className="panel systems-panel">
              <div className="panel-heading">
                <div>
                  <h3>Status dos sistemas</h3>
                  <p>Conexões em tempo real</p>
                </div>

                <button
                  className="refresh-button"
                  onClick={verificarConexao}
                  type="button"
                  title="Atualizar status dos sistemas"
                  aria-label="Atualizar status dos sistemas"
                >
                  ↻
                </button>
              </div>

              <div className="system-row">
                <div className="system-icon">TS</div>
                <div className="system-info">
                  <strong>Backend TypeScript</strong>
                  <small>Node.js / Express</small>
                </div>
                <span
                  className={`system-status ${
                    conexao.backend ? 'online' : 'offline'
                  }`}
                >
                  {conexao.backend ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="system-row">
                <div className="system-icon python">PY</div>
                <div className="system-info">
                  <strong>Inteligência Python</strong>
                  <small>FastAPI / Machine Learning</small>
                </div>
                <span
                  className={`system-status ${
                    conexao.inteligencia ? 'online' : 'offline'
                  }`}
                >
                  {conexao.inteligencia ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="last-check">
                Última verificação: {ultimaVerificacao}
              </div>
            </section>
          )}
        </div>

        <div className="section-heading analysis-heading">
          <div>
            <h2>Atividade inteligente</h2>
            <p>Analise os comportamentos identificados pela inteligência.</p>
          </div>
          <button
            className="panel-tag"
            type="button"
            onClick={() => setPagina('Inteligência')}
          >
            ABRIR ANÁLISE
          </button>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Últimas análises</h3>
              <p>Resultados recentes do modelo.</p>
            </div>
            <button
              className="panel-tag"
              type="button"
              onClick={() => setPagina('Histórico')}
            >
              VER HISTÓRICO
            </button>
          </div>

          {historico.length > 0 ? (
            <div className="history-list">
              {historico.slice(0, 3).map((item, index) => (
                <div className="history-row" key={index}>
                  <span
                    className={`history-indicator ${
                      item.suspeito ? 'suspicious' : 'normal'
                    }`}
                  />
                  <div className="history-info">
                    <strong>{item.classificacao || 'Evento analisado'}</strong>
                    <small>{item.recomendacao}</small>
                  </div>
                  <span className="history-confidence">
                    {item.confianca ?? 0}% confiança
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="history-empty">
              Ainda não existem eventos analisados. Acesse Inteligência para
              realizar a primeira análise.
            </div>
          )}
        </section>
      </>
    )
  }

  // Alertas
  function renderAlertas() {
    const alertas = historico.filter((item) => item.suspeito)

    return (
      <>
        <div className="section-heading">
          <div>
            <h2>Central de alertas</h2>
            <p>Eventos classificados como suspeitos pelo modelo.</p>
          </div>
          <span className="panel-tag">{alertas.length} ALERTAS</span>
        </div>

        <div className="metrics-grid">
          <MetricCard
            titulo="Total de alertas"
            icone="⚑"
            cor="orange"
            valor={alertas.length}
            descricao={<>Nesta sessão</>}
          />

          <MetricCard
            titulo="Eventos analisados"
            icone="⌁"
            cor="blue"
            valor={historico.length}
            descricao={<>Pelo modelo de ML</>}
          />

          <MetricCard
            titulo="Eventos normais"
            icone="✓"
            cor="green"
            valor={historico.length - alertas.length}
            descricao={<>Nesta sessão</>}
          />

          <MetricCard
            titulo="Status do backend"
            icone="TS"
            cor="purple"
            valor={conexao.backend ? 'OK' : '--'}
            descricao={conexao.backend ? 'Conectado' : 'Sem conexão'}
          />
        </div>

        <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <h3>Eventos suspeitos</h3>
              <p>Verifique as recomendações do sistema.</p>
            </div>
            <span className="panel-tag">{alertas.length} REGISTROS</span>
          </div>

          {alertas.length > 0 ? (
            <div className="history-list">
              {alertas.map((item, index) => (
                <div className="history-row" key={index}>
                  <span className="history-indicator suspicious" />
                  <div className="history-info">
                    <strong>{item.classificacao || 'Evento suspeito'}</strong>
                    <small>
                      {item.recomendacao || 'Verificação recomendada.'}
                    </small>
                  </div>
                  <span className="history-confidence">
                    {item.confianca ?? 0}% confiança
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-result">
              <div className="empty-symbol" aria-hidden="true">✓</div>
              <strong>Nenhum alerta suspeito nesta sessão</strong>
              <p>
                Quando o modelo identificar um comportamento suspeito, o
                resultado aparecerá nesta tela.
              </p>
              <button
                className="analyze-button"
                type="button"
                onClick={() => setPagina('Inteligência')}
              >
                Analisar novo evento
              </button>
            </div>
          )}
        </section>
      </>
    )
  }

  function renderConteudo() {
    switch (pagina) {
      case 'Visão geral':
        return renderVisaoGeral()
      case 'Inteligência':
        return renderAnalise()
      case 'Sensores':
        return renderSensores()
      case 'Alertas':
        return renderAlertas()
      case 'Histórico':
        return renderHistorico()
      case 'Meu perfil':
        return <Perfil usuario={usuario} onAtualizado={onUsuarioAtualizado} />
      default:
        return renderVisaoGeral()
    }
  }

  // Área administrativa: layout próprio (substitui o painel comum)
  if (ehAdmin && pagina === 'Administração') {
    return (
      <Admin
        usuario={usuario}
        onSair={onSair}
        onVoltar={() => setPagina('Visão geral')}
      />
    )
  }

  return (
<div className="app-shell">
  {/* Link de acessibilidade */}
  <a className="skip-link" href="#conteudo">
    Pular para o conteúdo
  </a>

  {/* Barra lateral de navegação */}
  <aside className="sidebar" aria-label="Barra lateral">
    <div className="brand">
      <div className="brand-icon">
        <img src="/favicon.svg" alt="Logo CORE FIX" width="43" height="43" />
      </div>
      <div>
        <strong>CORE FIX</strong>
        <span>INTELLIGENCE</span>
      </div>
    </div>

        <div className="menu-label">MENU PRINCIPAL</div>

        <nav className="navigation" aria-label="Menu principal">
          {[
            ['▦', 'Visão geral'],
            ['⌁', 'Inteligência'],
            ['◉', 'Sensores'],
            ['⚑', 'Alertas'],
            ['▤', 'Histórico'],
            ['☺', 'Meu perfil'],
            // Menu de administração: aparece só para quem tem papel admin
            ...(ehAdmin ? [['⚙', 'Administração']] : []),
          ].map(([icone, nome]) => (
            <button
              key={nome}
              type="button"
              className={`nav-item ${pagina === nome ? 'active' : ''}`}
              onClick={() => setPagina(nome)}
              aria-current={pagina === nome ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{icone}</span>
              {nome}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="home-status">
            <span
              className={`status-dot ${
                verificando ? 'checking' : conexao.backend ? '' : 'offline'
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>Smart Home</strong>
              <small>
                {verificando
                  ? 'Verificando...'
                  : conexao.backend
                    ? 'Monitoramento ativo'
                    : 'Monitoramento indisponível'}
              </small>
            </div>
          </div>

          <div className="sidebar-version">CORE FIX v1.1.0</div>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="main-content" id="conteudo" tabIndex={-1}>
        {/* Cabeçalho da página */}
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              CORE FIX / {pagina.toUpperCase()}
            </div>
            <h1>{pagina}</h1>
            <p className="page-subtitle">
              {pagina === 'Meu perfil'
                ? 'Gerencie seus dados e a segurança da sua conta.'
                : 'Sua casa aprende, analisa e protege sua rotina.'}
            </p>
          </div>

          <div className="topbar-right">
            <div
              className={`connection-badge ${classeStatus}`}
              role="status"
              aria-live="polite"
            >
              <span
                className={`status-dot ${classeStatus}`}
                aria-hidden="true"
              />
              {statusGeral}
            </div>
            <div className="avatar" title={usuario.nome} aria-hidden="true">
              {usuario.foto ? (
                <img src={usuario.foto} alt="" />
              ) : (
                usuario.nome.trim().slice(0, 2).toUpperCase()
              )}
            </div>
            <button type="button" className="sair-btn" onClick={onSair}>
              Sair
            </button>
          </div>
        </header>

        <div className="content-area">
          {renderConteudo()}

          {/* Rodapé */}
          <footer className="footer">
            <span>CORE FIX Intelligence © 2026</span>
            <span>
              Smart Home • Machine Learning • Automação inteligente
            </span>
          </footer>
        </div>
      </main>

      {/* Assistente virtual: só aparece na Visão geral.
          Fica montado (apenas oculto) para não perder a conversa ao trocar de tela. */}
      <div style={{ display: pagina === 'Visão geral' ? 'contents' : 'none' }}>
        <Chatbot />
      </div>
    </div>
  )
}

// Decide entre tela de login e painel; restaura a sessão se houver token salvo
function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [restaurando, setRestaurando] = useState(() => obterToken() !== null)

  useEffect(() => {
    if (!obterToken()) return

    apiJson<{ usuario: Usuario }>('/api/perfil')
      .then((r) => setUsuario(r.usuario))
      .catch(() => limparToken())
      .finally(() => setRestaurando(false))
  }, [])

  // Token expirado em qualquer tela: volta para o login
  useEffect(() => {
    const aoExpirar = () => setUsuario(null)
    window.addEventListener('corefix:sessao-expirada', aoExpirar)
    return () =>
      window.removeEventListener('corefix:sessao-expirada', aoExpirar)
  }, [])

  useEffect(() => {
    if (!usuario) document.title = 'Entrar · CORE FIX Intelligence'
  }, [usuario])

  function sair() {
    limparToken()
    setUsuario(null)
  }

  if (restaurando) {
    return (
      <main className="auth-page" id="conteudo">
        <p role="status">Carregando...</p>
      </main>
    )
  }

  // O login não devolve a foto; busca o perfil completo logo depois de entrar
  if (!usuario)
    return (
      <Login
        onEntrar={(u) => {
          setUsuario(u)
          apiJson<{ usuario: Usuario }>('/api/perfil')
            .then((r) => setUsuario(r.usuario))
            .catch(() => undefined)
        }}
      />
    )

  return (
    <Painel
      key={usuario.id}
      usuario={usuario}
      onSair={sair}
      onUsuarioAtualizado={setUsuario}
    />
  )
}

export default App
