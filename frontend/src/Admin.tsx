import { useCallback, useEffect, useState, type ReactNode } from 'react'
import './Admin.css'
import { API_URL, apiFetch, apiJson, mensagemDeErro, type Usuario } from './api'

// ===== Tipos =====
type UsuarioAdmin = {
  id: number
  nome: string
  email: string
  role: 'usuario' | 'admin'
  criado_em: string
  total_sensores: number
}

type SensorAdmin = {
  id: number
  nome: string
  tipo: string
  ambiente: string | null
  status: string
  valor_atual: number | null
  unidade: string | null
  usuario_nome: string | null
}

type EventoAdmin = {
  id: number
  tipo: string
  descricao: string | null
  gravidade: string | null
  suspeito: boolean
  confianca: number | null
  criado_em: string
  usuario_nome: string | null
}

type Aba =
  | 'resumo'
  | 'usuarios'
  | 'residencias'
  | 'sensores'
  | 'seguranca'
  | 'eventos'
  | 'relatorios'

type Resumo = {
  usuarios: number
  administradores: number
  sensores: number
  sensores_ativos: number
  eventos: number
  eventos_suspeitos: number
  serie_7_dias: { dia: string; total: number; suspeitos: number }[]
}

type Residencia = {
  usuario_id: number
  responsavel: string
  email: string
  sensores: number
  sensores_ativos: number
  eventos: number
  suspeitos: number
  ultima_atividade: string | null
}

type Seguranca = {
  suspeitos_24h: number
  suspeitos_7d: number
  baixa_confianca: number
  sensores_fora: number
  sensores_sem_dono: number
  usuarios_sem_sensor: number
  administradores: { id: number; nome: string; email: string }[]
  auditoria: {
    id: number
    admin_nome: string | null
    acao: string
    alvo: string | null
    detalhe: string | null
    criado_em: string
  }[]
}

// Menu do painel administrativo (7 itens: limite de Miller)
const MENU: { id: Aba; nome: string; icone: string; descricao: string }[] = [
  { id: 'resumo', nome: 'Visão geral', icone: '▦', descricao: 'Indicadores gerais da plataforma.' },
  { id: 'usuarios', nome: 'Usuários', icone: '☺', descricao: 'Contas, papéis e permissões de acesso.' },
  { id: 'residencias', nome: 'Residências', icone: '⌂', descricao: 'Situação de cada casa monitorada.' },
  { id: 'sensores', nome: 'Sensores', icone: '◉', descricao: 'Todos os sensores e seus estados.' },
  { id: 'seguranca', nome: 'Segurança', icone: '⛨', descricao: 'Riscos, serviços e registro de auditoria.' },
  { id: 'eventos', nome: 'Alertas e histórico', icone: '⚑', descricao: 'Eventos analisados pela inteligência.' },
  { id: 'relatorios', nome: 'Relatórios', icone: '▤', descricao: 'Exportação de dados em CSV.' },
]

function formatarData(valor: string | null) {
  return valor ? new Date(valor).toLocaleString('pt-BR') : '—'
}

// ===== Hook: carrega dados de uma rota e controla loading/erro =====
function useDados<T>(caminho: string) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setDados(await apiJson<T>(caminho))
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os dados.'))
    } finally {
      setCarregando(false)
    }
  }, [caminho])

  useEffect(() => {
    carregar()
  }, [carregar])

  return { dados, erro, carregando, recarregar: carregar }
}

// ===== Blocos reutilizáveis =====
function Estado({
  carregando,
  erro,
  onTentar,
  children,
}: {
  carregando: boolean
  erro: string
  onTentar: () => void
  children: ReactNode
}) {
  if (carregando) return <p className="adm-info" role="status">Carregando...</p>
  if (erro) {
    return (
      <div className="adm-erro" role="alert">
        <p>{erro}</p>
        <button type="button" className="adm-btn" onClick={onTentar}>
          Tentar novamente
        </button>
      </div>
    )
  }
  return <>{children}</>
}

function Selo({ tom, children }: { tom: 'ok' | 'alerta' | 'neutro'; children: ReactNode }) {
  return <span className={`adm-selo ${tom}`}>{children}</span>
}

// ===== Abas =====
// Saúde dos serviços: usa a rota pública /api/health
function SaudeServicos() {
  const [estado, setEstado] = useState<{
    backend: boolean
    banco: boolean
    inteligencia: boolean
  } | null>(null)
  const [verificando, setVerificando] = useState(true)

  const verificar = useCallback(async () => {
    setVerificando(true)
    try {
      // O backend responde 503 (com JSON) quando algum serviço está fora
      const dados = await (await fetch(`${API_URL}/api/health`)).json()
      setEstado({
        backend: dados.backend === 'online',
        banco: dados.banco === 'conectado',
        inteligencia: dados.inteligencia?.status === 'healthy',
      })
    } catch {
      setEstado({ backend: false, banco: false, inteligencia: false })
    } finally {
      setVerificando(false)
    }
  }, [])

  useEffect(() => {
    verificar()
  }, [verificar])

  const itens: [string, boolean | undefined][] = [
    ['Backend (Node.js)', estado?.backend],
    ['Banco de dados (PostgreSQL)', estado?.banco],
    ['Inteligência (Python)', estado?.inteligencia],
  ]

  return (
    <div className="adm-bloco">
      <div className="adm-bloco-topo">
        <h2>Saúde dos serviços</h2>
        <button type="button" className="adm-btn" onClick={verificar} disabled={verificando}>
          {verificando ? 'Verificando...' : 'Verificar agora'}
        </button>
      </div>
      <ul className="adm-lista">
        {itens.map(([nome, ok]) => (
          <li key={nome}>
            <span>{nome}</span>
            {estado === null ? (
              <Selo tom="neutro">...</Selo>
            ) : ok ? (
              <Selo tom="ok">Online</Selo>
            ) : (
              <Selo tom="alerta">Offline</Selo>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AbaResumo({ irPara }: { irPara: (a: Aba, filtro?: string) => void }) {
  const { dados, erro, carregando, recarregar } = useDados<Resumo>('/api/admin/resumo')

  const cartoes: [string, number | undefined, string, 'neutro' | 'alerta'][] = [
    ['Usuários', dados?.usuarios, `${dados?.administradores ?? 0} administrador(es)`, 'neutro'],
    ['Residências', dados?.usuarios, 'Uma por usuário cadastrado', 'neutro'],
    ['Sensores ativos', dados?.sensores_ativos, `de ${dados?.sensores ?? 0} cadastrados`, 'neutro'],
    ['Eventos analisados', dados?.eventos, 'Total no histórico', 'neutro'],
    ['Eventos suspeitos', dados?.eventos_suspeitos, 'Exigem atenção', 'alerta'],
  ]

  const serie = dados?.serie_7_dias ?? []
  const maximo = Math.max(1, ...serie.map((d) => d.total))

  return (
    <Estado carregando={carregando} erro={erro} onTentar={recarregar}>
      <ul className="adm-cards">
        {cartoes.map(([titulo, valor, desc, tom]) => (
          <li key={titulo} className={`adm-card ${tom}`}>
            <span>{titulo}</span>
            <strong>{valor ?? 0}</strong>
            <small>{desc}</small>
          </li>
        ))}
      </ul>

      <div className="adm-duas-colunas">
        <div className="adm-bloco">
          <div className="adm-bloco-topo">
            <h2>Eventos dos últimos 7 dias</h2>
          </div>
          <div
            className="adm-grafico"
            role="img"
            aria-label={`Eventos por dia: ${serie
              .map((d) => `${d.dia}, ${d.total} (${d.suspeitos} suspeitos)`)
              .join('; ')}`}
          >
            {serie.map((d) => (
              <div key={d.dia} className="adm-coluna">
                <div className="adm-barras">
                  <span
                    className="adm-barra total"
                    style={{ height: `${(d.total / maximo) * 100}%` }}
                    title={`${d.total} evento(s)`}
                  />
                  <span
                    className="adm-barra suspeito"
                    style={{ height: `${(d.suspeitos / maximo) * 100}%` }}
                    title={`${d.suspeitos} suspeito(s)`}
                  />
                </div>
                <small>{d.dia}</small>
              </div>
            ))}
          </div>
          <p className="adm-legenda">
            <span className="adm-ponto total" aria-hidden="true" /> Total
            <span className="adm-ponto suspeito" aria-hidden="true" /> Suspeitos
          </p>
        </div>

        <SaudeServicos />
      </div>

      <div className="adm-atalhos">
        <button type="button" className="adm-btn primario" onClick={() => irPara('eventos', 'true')}>
          Ver alertas suspeitos
        </button>
        <button type="button" className="adm-btn" onClick={() => irPara('usuarios')}>
          Gerenciar usuários
        </button>
        <button type="button" className="adm-btn" onClick={() => irPara('seguranca')}>
          Ver segurança
        </button>
      </div>
    </Estado>
  )
}

function statusResidencia(r: Residencia): { tom: 'ok' | 'alerta' | 'neutro'; texto: string } {
  if (r.suspeitos > 0) return { tom: 'alerta', texto: 'Atenção' }
  if (r.sensores === 0) return { tom: 'neutro', texto: 'Sem sensores' }
  if (r.sensores_ativos < r.sensores) return { tom: 'neutro', texto: 'Parcial' }
  return { tom: 'ok', texto: 'Normal' }
}

function AbaResidencias() {
  const { dados, erro, carregando, recarregar } = useDados<{ residencias: Residencia[] }>(
    '/api/admin/residencias',
  )
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()
  const lista = (dados?.residencias ?? []).filter(
    (r) => !termo || `${r.responsavel} ${r.email}`.toLowerCase().includes(termo),
  )

  return (
    <Estado carregando={carregando} erro={erro} onTentar={recarregar}>
      <div className="adm-filtros">
        <div className="adm-campo">
          <label htmlFor="busca-res">Buscar residência</label>
          <input
            id="busca-res"
            type="search"
            className="adm-input"
            placeholder="Nome ou e-mail do responsável"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <p className="adm-info adm-nota">
          Cada usuário cadastrado representa uma residência monitorada.
        </p>
      </div>

      {lista.length === 0 ? (
        <p className="adm-info">Nenhuma residência encontrada.</p>
      ) : (
        <ul className="adm-residencias">
          {lista.map((r) => {
            const st = statusResidencia(r)
            return (
              <li key={r.usuario_id} className="adm-residencia">
                <div className="adm-residencia-topo">
                  <div>
                    <strong>Residência de {r.responsavel}</strong>
                    <small>{r.email}</small>
                  </div>
                  <Selo tom={st.tom}>{st.texto}</Selo>
                </div>
                <dl>
                  <div><dt>Sensores</dt><dd>{r.sensores_ativos}/{r.sensores} ativos</dd></div>
                  <div><dt>Eventos</dt><dd>{r.eventos}</dd></div>
                  <div><dt>Suspeitos</dt><dd>{r.suspeitos}</dd></div>
                  <div><dt>Última atividade</dt><dd>{formatarData(r.ultima_atividade)}</dd></div>
                </dl>
              </li>
            )
          })}
        </ul>
      )}
    </Estado>
  )
}

const NOMES_ACAO: Record<string, string> = {
  alterar_papel: 'Alteração de papel',
  excluir_usuario: 'Exclusão de usuário',
  alterar_sensor: 'Alteração de sensor',
}

function AbaSeguranca({ irPara }: { irPara: (a: Aba, filtro?: string) => void }) {
  const { dados, erro, carregando, recarregar } = useDados<Seguranca>('/api/admin/seguranca')

  const indicadores: [string, number | undefined, string, boolean][] = [
    ['Suspeitos em 24 h', dados?.suspeitos_24h, 'Eventos classificados como suspeitos', true],
    ['Suspeitos em 7 dias', dados?.suspeitos_7d, 'Acompanhe a tendência', true],
    ['Baixa confiança', dados?.baixa_confianca, 'Classificações abaixo de 70% (revisão humana)', true],
    ['Sensores fora de operação', dados?.sensores_fora, 'Inativos ou em manutenção', true],
    ['Sensores sem dono', dados?.sensores_sem_dono, 'Sem usuário vinculado', true],
    ['Usuários sem sensor', dados?.usuarios_sem_sensor, 'Residências sem monitoramento', false],
  ]

  return (
    <Estado carregando={carregando} erro={erro} onTentar={recarregar}>
      <ul className="adm-cards">
        {indicadores.map(([titulo, valor, desc, alerta]) => (
          <li key={titulo} className={`adm-card ${alerta && (valor ?? 0) > 0 ? 'alerta' : 'neutro'}`}>
            <span>{titulo}</span>
            <strong>{valor ?? 0}</strong>
            <small>{desc}</small>
          </li>
        ))}
      </ul>

      <div className="adm-atalhos">
        <button type="button" className="adm-btn primario" onClick={() => irPara('eventos', 'true')}>
          Investigar eventos suspeitos
        </button>
        <button type="button" className="adm-btn" onClick={() => irPara('sensores')}>
          Revisar sensores
        </button>
      </div>

      <div className="adm-duas-colunas">
        <SaudeServicos />

        <div className="adm-bloco">
          <div className="adm-bloco-topo">
            <h2>Contas administradoras</h2>
          </div>
          <ul className="adm-lista">
            {dados?.administradores.map((a) => (
              <li key={a.id}>
                <span>{a.nome}</span>
                <small>{a.email}</small>
              </li>
            ))}
          </ul>
          <p className="adm-info adm-nota">
            Mantenha poucas contas com acesso total (princípio do menor privilégio).
          </p>
        </div>
      </div>

      <div className="adm-bloco">
        <div className="adm-bloco-topo">
          <h2>Registro de auditoria</h2>
          <small>Últimas ações feitas por administradores</small>
        </div>
        {dados?.auditoria.length === 0 ? (
          <p className="adm-info">Nenhuma ação registrada ainda.</p>
        ) : (
          <div className="adm-tabela-wrap" tabIndex={0} role="region" aria-label="Tabela de auditoria">
            <table className="adm-tabela">
              <caption className="sr-only">Ações administrativas registradas</caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Administrador</th>
                  <th scope="col">Ação</th>
                  <th scope="col">Alvo</th>
                  <th scope="col">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {dados?.auditoria.map((l) => (
                  <tr key={l.id}>
                    <td>{formatarData(l.criado_em)}</td>
                    <td>{l.admin_nome ?? '—'}</td>
                    <td>{NOMES_ACAO[l.acao] ?? l.acao}</td>
                    <td>{l.alvo ?? '—'}</td>
                    <td>{l.detalhe ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Estado>
  )
}

function AbaUsuarios({ meuId }: { meuId: number }) {
  const { dados, erro, carregando, recarregar } = useDados<{ usuarios: UsuarioAdmin[] }>(
    '/api/admin/usuarios',
  )
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [confirmando, setConfirmando] = useState<number | null>(null)

  async function mudarPapel(u: UsuarioAdmin, papel: string) {
    setAviso(null)
    try {
      await apiJson(`/api/admin/usuarios/${u.id}/papel`, {
        method: 'PUT',
        body: JSON.stringify({ papel }),
      })
      setAviso({ tipo: 'ok', texto: `Papel de ${u.nome} alterado para ${papel}.` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDeErro(e, 'Não foi possível alterar o papel.') })
    }
    recarregar()
  }

  async function excluir(u: UsuarioAdmin) {
    setAviso(null)
    setConfirmando(null)
    try {
      await apiJson(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' })
      setAviso({ tipo: 'ok', texto: `Usuário ${u.nome} excluído.` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDeErro(e, 'Não foi possível excluir.') })
    }
    recarregar()
  }

  return (
    <Estado carregando={carregando} erro={erro} onTentar={recarregar}>
      {aviso && (
        <p className={`adm-aviso ${aviso.tipo}`} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
        </p>
      )}
      <div className="adm-tabela-wrap" tabIndex={0} role="region" aria-label="Tabela de usuários">
        <table className="adm-tabela">
          <caption className="sr-only">Usuários cadastrados e seus papéis</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">Sensores</th>
              <th scope="col">Cadastro</th>
              <th scope="col">Papel</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados?.usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.nome} {u.id === meuId && <Selo tom="neutro">você</Selo>}
                </td>
                <td>{u.email}</td>
                <td>{u.total_sensores}</td>
                <td>{formatarData(u.criado_em)}</td>
                <td>
                  <label className="sr-only" htmlFor={`papel-${u.id}`}>
                    Papel de {u.nome}
                  </label>
                  <select
                    id={`papel-${u.id}`}
                    className="adm-select"
                    value={u.role}
                    onChange={(e) => mudarPapel(u, e.target.value)}
                  >
                    <option value="usuario">Usuário</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td>
                  {u.id === meuId ? (
                    <span className="adm-mudo">—</span>
                  ) : confirmando === u.id ? (
                    <span className="adm-confirma">
                      <button type="button" className="adm-btn perigo" onClick={() => excluir(u)}>
                        Confirmar
                      </button>
                      <button type="button" className="adm-btn" onClick={() => setConfirmando(null)}>
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="adm-btn perigo-suave"
                      onClick={() => setConfirmando(u.id)}
                      aria-label={`Excluir ${u.nome}`}
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Estado>
  )
}

function AbaSensores() {
  const { dados, erro, carregando, recarregar } = useDados<{ sensores: SensorAdmin[] }>(
    '/api/admin/sensores',
  )
  const [aviso, setAviso] = useState('')

  async function mudarStatus(s: SensorAdmin, status: string) {
    setAviso('')
    try {
      await apiJson(`/api/admin/sensores/${s.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
    } catch (e) {
      setAviso(mensagemDeErro(e, 'Não foi possível alterar o sensor.'))
    }
    recarregar()
  }

  return (
    <Estado carregando={carregando} erro={erro} onTentar={recarregar}>
      {aviso && <p className="adm-aviso erro" role="alert">{aviso}</p>}
      {dados?.sensores.length === 0 ? (
        <p className="adm-info">Nenhum sensor cadastrado.</p>
      ) : (
        <div className="adm-tabela-wrap" tabIndex={0} role="region" aria-label="Tabela de sensores">
          <table className="adm-tabela">
            <caption className="sr-only">Sensores de todos os usuários</caption>
            <thead>
              <tr>
                <th scope="col">Sensor</th>
                <th scope="col">Tipo</th>
                <th scope="col">Ambiente</th>
                <th scope="col">Dono</th>
                <th scope="col">Valor</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {dados?.sensores.map((s) => (
                <tr key={s.id}>
                  <td>{s.nome}</td>
                  <td>{s.tipo}</td>
                  <td>{s.ambiente ?? '—'}</td>
                  <td>{s.usuario_nome ?? '—'}</td>
                  <td>{s.valor_atual ?? '—'} {s.unidade ?? ''}</td>
                  <td>
                    <label className="sr-only" htmlFor={`status-${s.id}`}>
                      Status de {s.nome}
                    </label>
                    <select
                      id={`status-${s.id}`}
                      className="adm-select"
                      value={s.status}
                      onChange={(e) => mudarStatus(s, e.target.value)}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                      <option value="manutencao">Manutenção</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Estado>
  )
}

// Alertas e histórico no mesmo lugar: o filtro "Suspeitos" mostra só os alertas.
function AbaEventos({ suspeitoInicial }: { suspeitoInicial: string }) {
  const [suspeito, setSuspeito] = useState(suspeitoInicial)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [pagina, setPagina] = useState(1)

  const params = new URLSearchParams({ pagina: String(pagina), limite: '10' })
  if (suspeito) params.set('suspeito', suspeito)
  if (de) params.set('de', de)
  if (ate) params.set('ate', ate)

  const { dados, erro, carregando, recarregar } = useDados<{
    total: number
    eventos: EventoAdmin[]
  }>(`/api/admin/eventos?${params.toString()}`)

  const totalPaginas = Math.max(1, Math.ceil((dados?.total ?? 0) / 10))

  return (
    <>
      <div className="adm-filtros">
        {(
          <div className="adm-campo">
            <label htmlFor="f-suspeito">Classificação</label>
            <select
              id="f-suspeito"
              className="adm-select"
              value={suspeito}
              onChange={(e) => { setSuspeito(e.target.value); setPagina(1) }}
            >
              <option value="">Todos</option>
              <option value="true">Suspeitos</option>
              <option value="false">Normais</option>
            </select>
          </div>
        )}
        <div className="adm-campo">
          <label htmlFor="f-de">De</label>
          <input id="f-de" type="date" className="adm-input" value={de}
            onChange={(e) => { setDe(e.target.value); setPagina(1) }} />
        </div>
        <div className="adm-campo">
          <label htmlFor="f-ate">Até</label>
          <input id="f-ate" type="date" className="adm-input" value={ate}
            onChange={(e) => { setAte(e.target.value); setPagina(1) }} />
        </div>
      </div>

      <Estado carregando={carregando} erro={erro} onTentar={recarregar}>
        {dados?.eventos.length === 0 ? (
          <p className="adm-info">Nenhum evento encontrado para este filtro.</p>
        ) : (
          <div className="adm-tabela-wrap" tabIndex={0} role="region" aria-label="Tabela de eventos">
            <table className="adm-tabela">
              <caption className="sr-only">
                Eventos analisados pela inteligência
              </caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Gravidade</th>
                  <th scope="col">Confiança</th>
                  <th scope="col">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {dados?.eventos.map((ev) => (
                  <tr key={ev.id}>
                    <td>{formatarData(ev.criado_em)}</td>
                    <td>{ev.tipo}</td>
                    <td>{ev.descricao ?? '—'}</td>
                    <td>{ev.gravidade ?? '—'}</td>
                    <td>
                      {ev.confianca === null
                        ? '—'
                        : `${Math.round(Number(ev.confianca) * (Number(ev.confianca) <= 1 ? 100 : 1))}%`}
                    </td>
                    <td>
                      {ev.suspeito ? <Selo tom="alerta">Suspeito</Selo> : <Selo tom="ok">Normal</Selo>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <nav className="adm-paginacao" aria-label="Paginação">
          <button type="button" className="adm-btn" disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <span>Página {pagina} de {totalPaginas} · {dados?.total ?? 0} evento(s)</span>
          <button type="button" className="adm-btn" disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </nav>
      </Estado>
    </>
  )
}

function AbaRelatorios() {
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [baixando, setBaixando] = useState('')
  const [erro, setErro] = useState('')

  // O arquivo precisa do token, então baixamos via fetch e geramos o link local
  async function baixar(tipo: 'eventos' | 'sensores' | 'usuarios') {
    setErro('')
    setBaixando(tipo)
    try {
      const params = new URLSearchParams({ tipo })
      if (tipo === 'eventos') {
        if (de) params.set('de', de)
        if (ate) params.set('ate', ate)
      }
      const resp = await apiFetch(`/api/admin/relatorio?${params.toString()}`)
      if (!resp.ok) throw new Error()

      const url = URL.createObjectURL(await resp.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `corefix-${tipo}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setErro('Não foi possível gerar o relatório. Tente novamente.')
    } finally {
      setBaixando('')
    }
  }

  const itens: ['eventos' | 'sensores' | 'usuarios', string, string][] = [
    ['eventos', 'Eventos e alertas', 'Histórico de eventos analisados (respeita as datas abaixo).'],
    ['sensores', 'Sensores', 'Todos os sensores com status e último valor.'],
    ['usuarios', 'Usuários', 'Usuários e papéis (sem senhas).'],
  ]

  return (
    <>
      {erro && <p className="adm-aviso erro" role="alert">{erro}</p>}
      <div className="adm-filtros">
        <div className="adm-campo">
          <label htmlFor="r-de">Eventos de</label>
          <input id="r-de" type="date" className="adm-input" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="adm-campo">
          <label htmlFor="r-ate">Eventos até</label>
          <input id="r-ate" type="date" className="adm-input" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>
      <ul className="adm-relatorios">
        {itens.map(([tipo, titulo, desc]) => (
          <li key={tipo} className="adm-card">
            <strong>{titulo}</strong>
            <small>{desc}</small>
            <button type="button" className="adm-btn primario" disabled={baixando === tipo}
              onClick={() => baixar(tipo)}>
              {baixando === tipo ? 'Gerando...' : 'Baixar CSV'}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

// ===== Componente principal: painel administrativo com layout próprio =====
type Props = {
  usuario: Usuario
  onSair: () => void
  onVoltar: () => void
}

function Admin({ usuario, onSair, onVoltar }: Props) {
  const [aba, setAba] = useState<Aba>('resumo')
  const [filtroEventos, setFiltroEventos] = useState('')

  const atual = MENU.find((m) => m.id === aba) ?? MENU[0]

  function irPara(destino: Aba, filtro = '') {
    setFiltroEventos(filtro)
    setAba(destino)
  }

  useEffect(() => {
    document.title = `${atual.nome} · Administração · CORE FIX`
  }, [atual.nome])

  return (
    <div className="adm-shell">
      <a className="skip-link" href="#adm-conteudo">
        Pular para o conteúdo
      </a>

      {/* Menu lateral administrativo */}
      <aside className="adm-lateral" aria-label="Menu administrativo">
        <div className="adm-marca">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <div>
            <strong>CORE FIX</strong>
            <span>PAINEL ADMIN</span>
          </div>
        </div>

        <nav aria-label="Seções da administração">
          <ul className="adm-menu">
            {MENU.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`adm-menu-item ${aba === m.id ? 'ativo' : ''}`}
                  onClick={() => irPara(m.id)}
                  aria-current={aba === m.id ? 'page' : undefined}
                >
                  <span className="adm-menu-icone" aria-hidden="true">{m.icone}</span>
                  {m.nome}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <button type="button" className="adm-voltar" onClick={onVoltar}>
          ← Voltar ao painel
        </button>
      </aside>

      <main className="adm-principal" id="adm-conteudo" tabIndex={-1}>
        <header className="adm-topo">
          <div>
            <p className="adm-trilha">ADMINISTRAÇÃO / {atual.nome.toUpperCase()}</p>
            <h1>{atual.nome}</h1>
            <p className="adm-sub">{atual.descricao}</p>
          </div>
          <div className="adm-topo-dir">
            <span className="adm-modo">Modo administrador</span>
            <span className="adm-quem">{usuario.nome}</span>
            <button type="button" className="adm-btn" onClick={onSair}>
              Sair
            </button>
          </div>
        </header>

        <section className="adm-conteudo" aria-label={atual.nome}>
          {aba === 'resumo' && <AbaResumo irPara={irPara} />}
          {aba === 'usuarios' && <AbaUsuarios meuId={usuario.id} />}
          {aba === 'residencias' && <AbaResidencias />}
          {aba === 'sensores' && <AbaSensores />}
          {aba === 'seguranca' && <AbaSeguranca irPara={irPara} />}
          {aba === 'eventos' && <AbaEventos key={filtroEventos} suspeitoInicial={filtroEventos} />}
          {aba === 'relatorios' && <AbaRelatorios />}
        </section>

        <footer className="adm-rodape">
          <span>CORE FIX Intelligence © 2026</span>
          <span>Área administrativa · acesso restrito</span>
        </footer>
      </main>
    </div>
  )
}

export default Admin
