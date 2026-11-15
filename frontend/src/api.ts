// Camada única de comunicação com o backend.
// Todas as telas usam apiFetch/apiJson, então o token JWT é enviado automaticamente.

export const API_URL = 'http://localhost:3000'

const CHAVE_TOKEN = 'corefix_token'

export function obterToken(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_TOKEN)
  } catch {
    return null
  }
}

export function salvarToken(token: string) {
  try {
    sessionStorage.setItem(CHAVE_TOKEN, token)
  } catch {
    /* armazenamento indisponível: a sessão vale só até recarregar */
  }
}

export function limparToken() {
  try {
    sessionStorage.removeItem(CHAVE_TOKEN)
  } catch {
    /* ignora */
  }
}

export class ErroApi extends Error {
  status: number

  constructor(mensagem: string, status: number) {
    super(mensagem)
    this.status = status
  }
}

export async function apiFetch(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<Response> {
  const token = obterToken()
  const headers = new Headers(opcoes.headers)

  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (opcoes.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const resposta = await fetch(`${API_URL}${caminho}`, { ...opcoes, headers })

  // Token expirado/inválido: avisa o App para voltar ao login
  if (resposta.status === 401 && token) {
    limparToken()
    window.dispatchEvent(new Event('corefix:sessao-expirada'))
  }

  return resposta
}

export async function apiJson<T>(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<T> {
  const resposta = await apiFetch(caminho, opcoes)
  const dados = await resposta.json().catch(() => ({}))

  if (!resposta.ok) {
    throw new ErroApi(
      (dados as { erro?: string }).erro ?? 'Não foi possível concluir a operação.',
      resposta.status,
    )
  }

  return dados as T
}

export type Usuario = {
  id: number
  nome: string
  email: string
  papel: 'usuario' | 'admin'
  // Preenchidos pela página de perfil
  genero?: string | null
  data_nascimento?: string | null
  criado_em?: string
  login_social?: boolean
  residencia_apelido?: string | null
  residencia_cidade?: string | null
  residencia_tipo?: string | null
  residencia_moradores?: number | null
  foto?: string | null
}

export function mensagemDeErro(error: unknown, padrao: string): string {
  if (error instanceof ErroApi) return error.message
  if (error instanceof TypeError) {
    return 'Não foi possível conectar ao servidor. Verifique se o backend está ligado.'
  }
  return padrao
}
