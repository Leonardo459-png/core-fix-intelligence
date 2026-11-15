// Animação de fundo: pontos (sensores) que se conectam quando ficam próximos.
// Lógica independente do React para ficar simples de testar.

type Ponto = { x: number; y: number; vx: number; vy: number; r: number }

const DISTANCIA_LIGACAO = 140
const DISTANCIA_MOUSE = 170
const COR_PONTO = '94, 162, 255'

export function iniciarRede(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const reduzirMovimento = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches

  let largura = 0
  let altura = 0
  let pontos: Ponto[] = []
  let quadro = 0
  const mouse = { x: -9999, y: -9999 }

  function criarPontos() {
    // Quantidade proporcional à área (com teto) para não pesar em telas grandes
    const total = Math.min(90, Math.max(24, Math.round((largura * altura) / 13000)))
    pontos = Array.from({ length: total }, () => ({
      x: Math.random() * largura,
      y: Math.random() * altura,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1.2 + Math.random() * 1.6,
    }))
  }

  function ajustarTamanho() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    largura = canvas.clientWidth
    altura = canvas.clientHeight
    canvas.width = Math.round(largura * dpr)
    canvas.height = Math.round(altura * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    criarPontos()
  }

  function desenhar() {
    const c = ctx!
    c.clearRect(0, 0, largura, altura)

    for (let i = 0; i < pontos.length; i++) {
      const p = pontos[i]

      // Linhas entre pontos próximos: quanto mais perto, mais forte
      for (let j = i + 1; j < pontos.length; j++) {
        const q = pontos[j]
        const d = Math.hypot(p.x - q.x, p.y - q.y)
        if (d < DISTANCIA_LIGACAO) {
          c.strokeStyle = `rgba(${COR_PONTO}, ${(1 - d / DISTANCIA_LIGACAO) * 0.42})`
          c.lineWidth = 1
          c.beginPath()
          c.moveTo(p.x, p.y)
          c.lineTo(q.x, q.y)
          c.stroke()
        }
      }

      // Linhas até o cursor
      const dm = Math.hypot(p.x - mouse.x, p.y - mouse.y)
      if (dm < DISTANCIA_MOUSE) {
        c.strokeStyle = `rgba(${COR_PONTO}, ${(1 - dm / DISTANCIA_MOUSE) * 0.6})`
        c.beginPath()
        c.moveTo(p.x, p.y)
        c.lineTo(mouse.x, mouse.y)
        c.stroke()
      }

      c.fillStyle = `rgba(${COR_PONTO}, 0.85)`
      c.beginPath()
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      c.fill()
    }
  }

  function mover() {
    for (const p of pontos) {
      p.x += p.vx
      p.y += p.vy
      // Rebate nas bordas
      if (p.x < 0 || p.x > largura) p.vx *= -1
      if (p.y < 0 || p.y > altura) p.vy *= -1
    }
  }

  function loop() {
    mover()
    desenhar()
    quadro = requestAnimationFrame(loop)
  }

  function aoMoverMouse(e: PointerEvent) {
    const caixa = canvas.getBoundingClientRect()
    mouse.x = e.clientX - caixa.left
    mouse.y = e.clientY - caixa.top
  }

  function aoSairMouse() {
    mouse.x = -9999
    mouse.y = -9999
  }

  // Pausa com a aba escondida (economiza bateria)
  function aoMudarVisibilidade() {
    cancelAnimationFrame(quadro)
    if (!document.hidden && !reduzirMovimento) loop()
  }

  ajustarTamanho()

  if (reduzirMovimento) {
    desenhar() // quadro estático
  } else {
    loop()
  }

  window.addEventListener('resize', ajustarTamanho)
  window.addEventListener('pointermove', aoMoverMouse)
  document.addEventListener('pointerleave', aoSairMouse)
  document.addEventListener('visibilitychange', aoMudarVisibilidade)

  return () => {
    cancelAnimationFrame(quadro)
    window.removeEventListener('resize', ajustarTamanho)
    window.removeEventListener('pointermove', aoMoverMouse)
    document.removeEventListener('pointerleave', aoSairMouse)
    document.removeEventListener('visibilitychange', aoMudarVisibilidade)
  }
}
