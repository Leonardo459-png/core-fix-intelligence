import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import './Perfil.css'
import { apiJson, mensagemDeErro, type Usuario } from './api'

const IDADE_MINIMA = 18

const GENEROS: [string, string][] = [
  ['feminino', 'Feminino'],
  ['masculino', 'Masculino'],
  ['outro', 'Outro'],
  ['nao_informar', 'Prefiro não informar'],
]

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null

type Resumo = {
  sensores: number
  sensores_ativos: number
  eventos: number
  alertas: number
  ultima_analise: string | null
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return 'Nenhuma ainda'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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
    hoje.getMonth() + 1 > mes || (hoje.getMonth() + 1 === mes && hoje.getDate() >= dia)
  if (!fezAniversario) idade--
  return idade
}

function formatarData(valor?: string | null) {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function Mensagem({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null
  return (
    <p
      className={aviso.tipo === 'ok' ? 'perfil-aviso ok' : 'perfil-aviso erro'}
      role={aviso.tipo === 'ok' ? 'status' : 'alert'}
    >
      {aviso.texto}
    </p>
  )
}

function useAvisoTemporario(aviso: Aviso, limpar: (a: Aviso) => void, ms = 1000) {
  useEffect(() => {
    if (!aviso || aviso.tipo !== 'ok') return
    const t = window.setTimeout(() => limpar(null), ms)
    return () => window.clearTimeout(t)
  }, [aviso, limpar, ms])
}

function Perfil({
  usuario,
  onAtualizado,
}: {
  usuario: Usuario
  onAtualizado: (u: Usuario) => void
}) {
  const [carregando, setCarregando] = useState(true)
  const [dados, setDados] = useState<Usuario>(usuario)

  // Dados pessoais
  const [nome, setNome] = useState(usuario.nome)
  const [genero, setGenero] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [errosDados, setErrosDados] = useState<{ nome?: string; nascimento?: string }>({})
  const [avisoDados, setAvisoDados] = useState<Aviso>(null)
  const [salvando, setSalvando] = useState(false)

  // Senha
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [errosSenha, setErrosSenha] = useState<{ atual?: string; nova?: string; confirmar?: string }>({})
  const [avisoSenha, setAvisoSenha] = useState<Aviso>(null)
  const [trocando, setTrocando] = useState(false)

  // Residência
  const [apelido, setApelido] = useState('')
  const [cidade, setCidade] = useState('')
  const [tipoResid, setTipoResid] = useState('')
  const [moradores, setMoradores] = useState('')
  const [erroMoradores, setErroMoradores] = useState('')
  const [avisoResid, setAvisoResid] = useState<Aviso>(null)
  const [salvandoResid, setSalvandoResid] = useState(false)

  // Foto de perfil
  const [avisoFoto, setAvisoFoto] = useState<Aviso>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)

  // Mensagens de sucesso somem sozinhas depois de alguns segundos (erros ficam até a próxima ação)
  useAvisoTemporario(avisoFoto, setAvisoFoto)
  useAvisoTemporario(avisoDados, setAvisoDados)
  useAvisoTemporario(avisoSenha, setAvisoSenha)
  useAvisoTemporario(avisoResid, setAvisoResid)

  // Resumo da atividade
  const [resumo, setResumo] = useState<Resumo | null>(null)

  function preencher(u: Usuario) {
    setDados(u)
    setNome(u.nome)
    setGenero(u.genero ?? '')
    setNascimento(u.data_nascimento ?? '')
    setApelido(u.residencia_apelido ?? '')
    setCidade(u.residencia_cidade ?? '')
    setTipoResid(u.residencia_tipo ?? '')
    setMoradores(u.residencia_moradores ? String(u.residencia_moradores) : '')
  }

  useEffect(() => {
    apiJson<{ usuario: Usuario }>('/api/perfil')
      .then((r) => preencher(r.usuario))
      .catch((error: unknown) =>
        setAvisoDados({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível carregar o perfil.') }),
      )
      .finally(() => setCarregando(false))

    // O resumo é um extra: se falhar, o restante do perfil continua funcionando
    apiJson<Resumo>('/api/perfil/resumo')
      .then(setResumo)
      .catch(() => setResumo(null))
  }, [])

  async function salvarResidencia(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setAvisoResid(null)

    const n = moradores === '' ? null : Number(moradores)
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20)) {
      setErroMoradores('Informe de 1 a 20 moradores.')
      return
    }
    setErroMoradores('')

    setSalvandoResid(true)
    try {
      const r = await apiJson<{ usuario: Usuario }>('/api/perfil/residencia', {
        method: 'PUT',
        body: JSON.stringify({ apelido, cidade, tipo: tipoResid, moradores: n }),
      })
      preencher(r.usuario)
      setAvisoResid({ tipo: 'ok', texto: 'Residência atualizada com sucesso.' })
    } catch (error) {
      setAvisoResid({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível salvar a residência.') })
    } finally {
      setSalvandoResid(false)
    }
  }

  // Reduz a imagem escolhida para um quadrado de 256 px (JPEG) antes de enviar
  function prepararFoto(arquivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo)
      const img = new Image()
      img.onload = () => {
        const lado = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 256
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          reject(new Error('Seu navegador não conseguiu processar a imagem.'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 256, 256)
        ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Não foi possível ler essa imagem. Tente outro arquivo.'))
      }
      img.src = url
    })
  }

  async function escolherFoto(ev: ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0]
    ev.target.value = ''
    if (!arquivo) return
    setAvisoFoto(null)

    if (!arquivo.type.startsWith('image/')) {
      setAvisoFoto({ tipo: 'erro', texto: 'Escolha um arquivo de imagem (JPG, PNG ou WebP).' })
      return
    }
    if (arquivo.size > 8 * 1024 * 1024) {
      setAvisoFoto({ tipo: 'erro', texto: 'A imagem deve ter no máximo 8 MB.' })
      return
    }

    setEnviandoFoto(true)
    try {
      const foto = await prepararFoto(arquivo)
      const r = await apiJson<{ usuario: Usuario }>('/api/perfil/foto', {
        method: 'PUT',
        body: JSON.stringify({ foto }),
      })
      preencher(r.usuario)
      onAtualizado(r.usuario)
      setAvisoFoto({ tipo: 'ok', texto: 'Foto atualizada.' })
    } catch (error) {
      setAvisoFoto({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível salvar a foto.') })
    } finally {
      setEnviandoFoto(false)
    }
  }

  async function removerFoto() {
    setAvisoFoto(null)
    setEnviandoFoto(true)
    try {
      const r = await apiJson<{ usuario: Usuario }>('/api/perfil/foto', { method: 'DELETE' })
      preencher(r.usuario)
      onAtualizado(r.usuario)
      setAvisoFoto({ tipo: 'ok', texto: 'Foto removida.' })
    } catch (error) {
      setAvisoFoto({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível remover a foto.') })
    } finally {
      setEnviandoFoto(false)
    }
  }

  async function salvarDados(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setAvisoDados(null)

    const e: { nome?: string; nascimento?: string } = {}
    if (nome.trim().length < 2) e.nome = 'Informe seu nome.'
    if (nascimento) {
      if (nascimento > hojeISO()) e.nascimento = 'A data não pode estar no futuro.'
      else if (calcularIdade(nascimento) < IDADE_MINIMA)
        e.nascimento = `É necessário ter ${IDADE_MINIMA} anos ou mais.`
    }
    setErrosDados(e)
    if (Object.keys(e).length > 0) return

    setSalvando(true)
    try {
      const r = await apiJson<{ usuario: Usuario }>('/api/perfil', {
        method: 'PUT',
        body: JSON.stringify({ nome: nome.trim(), genero, data_nascimento: nascimento }),
      })
      preencher(r.usuario)
      onAtualizado(r.usuario)
      setAvisoDados({ tipo: 'ok', texto: 'Dados atualizados com sucesso.' })
    } catch (error) {
      setAvisoDados({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível salvar.') })
    } finally {
      setSalvando(false)
    }
  }

  async function salvarSenha(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setAvisoSenha(null)

    const e: { atual?: string; nova?: string; confirmar?: string } = {}
    if (!atual) e.atual = 'Informe a senha atual.'
    if (nova.length < 8) e.nova = 'A senha deve ter pelo menos 8 caracteres.'
    else if (nova === atual) e.nova = 'A nova senha deve ser diferente da atual.'
    if (!confirmar) e.confirmar = 'Confirme a nova senha.'
    else if (confirmar !== nova) e.confirmar = 'As senhas não coincidem.'
    setErrosSenha(e)
    if (Object.keys(e).length > 0) return

    setTrocando(true)
    try {
      await apiJson('/api/perfil/senha', {
        method: 'PUT',
        body: JSON.stringify({ senha_atual: atual, nova_senha: nova }),
      })
      setAtual('')
      setNova('')
      setConfirmar('')
      setAvisoSenha({ tipo: 'ok', texto: 'Senha alterada com sucesso.' })
    } catch (error) {
      setAvisoSenha({ tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível alterar a senha.') })
    } finally {
      setTrocando(false)
    }
  }

  const tipoSenha = mostrar ? 'text' : 'password'
  const iniciais = dados.nome.trim().slice(0, 2).toUpperCase()

  return (
    <div className="perfil">
      <section className="perfil-resumo" aria-labelledby="perfil-resumo-titulo">
        <div className="perfil-avatar" aria-hidden={dados.foto ? undefined : true}>
          {dados.foto ? <img src={dados.foto} alt={`Foto de ${dados.nome}`} /> : iniciais}
        </div>
        <div className="perfil-resumo-texto">
          <h2 id="perfil-resumo-titulo">{dados.nome}</h2>
          <p>{dados.email}</p>
          <ul className="perfil-selos" aria-label="Situação da conta">
            <li>{dados.papel === 'admin' ? 'Administrador' : 'Morador'}</li>
            <li>Membro desde {formatarData(dados.criado_em)}</li>
          </ul>
          <div className="perfil-foto-acoes">
            <label className={`perfil-botao-sec${enviandoFoto ? ' desativado' : ''}`}>
              {enviandoFoto ? 'Enviando...' : dados.foto ? 'Trocar foto' : 'Adicionar foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={escolherFoto}
                disabled={enviandoFoto}
              />
            </label>
            {dados.foto && (
              <button type="button" className="perfil-botao-sec perigo" onClick={removerFoto} disabled={enviandoFoto}>
                Remover
              </button>
            )}
          </div>
          <Mensagem aviso={avisoFoto} />
        </div>
      </section>

      {resumo && (
        <section aria-labelledby="perfil-atividade-titulo">
          <h2 id="perfil-atividade-titulo" className="perfil-titulo-secao">Resumo da atividade</h2>
          <ul className="perfil-stats">
            <li>
              <strong>{resumo.sensores}</strong>
              <span>Sensores cadastrados</span>
              <small>{resumo.sensores_ativos} ativos</small>
            </li>
            <li>
              <strong>{resumo.eventos}</strong>
              <span>Eventos analisados</span>
              <small>Histórico completo</small>
            </li>
            <li>
              <strong>{resumo.alertas}</strong>
              <span>Alertas suspeitos</span>
              <small>{resumo.alertas === 0 ? 'Tudo tranquilo' : 'Requer atenção'}</small>
            </li>
            <li>
              <strong className="perfil-stat-data">{formatarDataHora(resumo.ultima_analise)}</strong>
              <span>Última análise</span>
              <small>Pelo modelo de ML</small>
            </li>
          </ul>
        </section>
      )}

      <div className="perfil-grade">
        <div className="perfil-coluna">
        <section className="perfil-card" aria-labelledby="perfil-dados-titulo">
          <h2 id="perfil-dados-titulo">Dados pessoais</h2>
          <p className="perfil-sub">Estes dados ficam só na sua conta. Gênero e nascimento são opcionais.</p>

          {carregando ? (
            <p role="status">Carregando...</p>
          ) : (
            <form onSubmit={salvarDados} noValidate>
              <div className="perfil-campo">
                <label htmlFor="perfil-nome">Nome</label>
                <input
                  id="perfil-nome"
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  aria-required="true"
                  aria-invalid={errosDados.nome ? true : undefined}
                  aria-describedby={errosDados.nome ? 'perfil-nome-erro' : undefined}
                />
                {errosDados.nome && (
                  <span id="perfil-nome-erro" className="perfil-erro" role="alert">{errosDados.nome}</span>
                )}
              </div>

              <div className="perfil-campo">
                <label htmlFor="perfil-email">E-mail</label>
                <input id="perfil-email" type="email" value={dados.email} readOnly aria-describedby="perfil-email-dica" />
                <span id="perfil-email-dica" className="perfil-dica">O e-mail identifica sua conta e não pode ser alterado.</span>
              </div>

              <div className="perfil-linha">
                <div className="perfil-campo">
                  <label htmlFor="perfil-nascimento">Nascimento</label>
                  <input
                    id="perfil-nascimento"
                    type="date"
                    max={hojeISO()}
                    autoComplete="bday"
                    value={nascimento}
                    onChange={(e) => setNascimento(e.target.value)}
                    aria-invalid={errosDados.nascimento ? true : undefined}
                    aria-describedby={errosDados.nascimento ? 'perfil-nascimento-erro' : undefined}
                  />
                  {errosDados.nascimento && (
                    <span id="perfil-nascimento-erro" className="perfil-erro" role="alert">
                      {errosDados.nascimento}
                    </span>
                  )}
                </div>

                <div className="perfil-campo">
                  <label htmlFor="perfil-genero">Gênero</label>
                  <select id="perfil-genero" value={genero} onChange={(e) => setGenero(e.target.value)}>
                    <option value="">Não informado</option>
                    {GENEROS.map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>{rotulo}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Mensagem aviso={avisoDados} />

              <button type="submit" className="perfil-botao" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </form>
          )}
        </section>

        <section className="perfil-card" aria-labelledby="perfil-senha-titulo">
          <h2 id="perfil-senha-titulo">Segurança</h2>

          {dados.login_social ? (
            <p className="perfil-sub">
              Sua conta entra pelo Google ou GitHub, então a senha é gerenciada por esse serviço.
              Não há senha para trocar aqui.
            </p>
          ) : (
            <>
              <p className="perfil-sub">Use pelo menos 8 caracteres. Depois de trocar, a nova senha vale no próximo login.</p>
              <form onSubmit={salvarSenha} noValidate>
                <div className="perfil-campo">
                  <label htmlFor="perfil-atual">Senha atual</label>
                  <input
                    id="perfil-atual"
                    type={tipoSenha}
                    autoComplete="current-password"
                    value={atual}
                    onChange={(e) => setAtual(e.target.value)}
                    aria-required="true"
                    aria-invalid={errosSenha.atual ? true : undefined}
                    aria-describedby={errosSenha.atual ? 'perfil-atual-erro' : undefined}
                  />
                  {errosSenha.atual && (
                    <span id="perfil-atual-erro" className="perfil-erro" role="alert">{errosSenha.atual}</span>
                  )}
                </div>

                <div className="perfil-campo">
                  <label htmlFor="perfil-nova">Nova senha</label>
                  <input
                    id="perfil-nova"
                    type={tipoSenha}
                    autoComplete="new-password"
                    value={nova}
                    onChange={(e) => setNova(e.target.value)}
                    aria-required="true"
                    aria-invalid={errosSenha.nova ? true : undefined}
                    aria-describedby={errosSenha.nova ? 'perfil-nova-erro' : undefined}
                  />
                  {errosSenha.nova && (
                    <span id="perfil-nova-erro" className="perfil-erro" role="alert">{errosSenha.nova}</span>
                  )}
                </div>

                <div className="perfil-campo">
                  <label htmlFor="perfil-confirmar">Confirmar nova senha</label>
                  <input
                    id="perfil-confirmar"
                    type={tipoSenha}
                    autoComplete="new-password"
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    aria-required="true"
                    aria-invalid={errosSenha.confirmar ? true : undefined}
                    aria-describedby={errosSenha.confirmar ? 'perfil-confirmar-erro' : undefined}
                  />
                  {errosSenha.confirmar && (
                    <span id="perfil-confirmar-erro" className="perfil-erro" role="alert">{errosSenha.confirmar}</span>
                  )}
                </div>

                <label className="perfil-check">
                  <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
                  Mostrar senhas
                </label>

                <Mensagem aviso={avisoSenha} />

                <button type="submit" className="perfil-botao" disabled={trocando}>
                  {trocando ? 'Alterando...' : 'Alterar senha'}
                </button>
              </form>
            </>
          )}
        </section>
        </div>

        <div className="perfil-coluna">
          <section className="perfil-card" aria-labelledby="perfil-resid-titulo">
            <h2 id="perfil-resid-titulo">Minha residência</h2>
            <p className="perfil-sub">Ajuda a identificar sua casa no sistema e no painel administrativo.</p>

            {carregando ? (
              <p role="status">Carregando...</p>
            ) : (
              <form onSubmit={salvarResidencia} noValidate>
                <div className="perfil-campo">
                  <label htmlFor="perfil-apelido">Apelido da residência</label>
                  <input
                    id="perfil-apelido"
                    type="text"
                    maxLength={60}
                    placeholder="Ex: Casa da praia"
                    value={apelido}
                    onChange={(e) => setApelido(e.target.value)}
                  />
                </div>

                <div className="perfil-campo">
                  <label htmlFor="perfil-cidade">Cidade</label>
                  <input
                    id="perfil-cidade"
                    type="text"
                    maxLength={60}
                    autoComplete="address-level2"
                    placeholder="Ex: Curitiba"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                  />
                </div>

                <div className="perfil-linha">
                  <div className="perfil-campo">
                    <label htmlFor="perfil-tipo-resid">Tipo</label>
                    <select id="perfil-tipo-resid" value={tipoResid} onChange={(e) => setTipoResid(e.target.value)}>
                      <option value="">Não informado</option>
                      <option value="casa">Casa</option>
                      <option value="apartamento">Apartamento</option>
                    </select>
                  </div>

                  <div className="perfil-campo">
                    <label htmlFor="perfil-moradores">Moradores</label>
                    <input
                      id="perfil-moradores"
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      inputMode="numeric"
                      value={moradores}
                      onChange={(e) => setMoradores(e.target.value)}
                      aria-invalid={erroMoradores ? true : undefined}
                      aria-describedby={erroMoradores ? 'perfil-moradores-erro' : undefined}
                    />
                    {erroMoradores && (
                      <span id="perfil-moradores-erro" className="perfil-erro" role="alert">{erroMoradores}</span>
                    )}
                  </div>
                </div>

                <Mensagem aviso={avisoResid} />

                <button type="submit" className="perfil-botao" disabled={salvandoResid}>
                  {salvandoResid ? 'Salvando...' : 'Salvar residência'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default Perfil