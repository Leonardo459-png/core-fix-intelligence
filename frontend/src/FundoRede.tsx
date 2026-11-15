import { useEffect, useRef } from 'react'
import { iniciarRede } from './rede'

// Canvas decorativo: fica atrás do conteúdo e é ignorado por leitores de tela
function FundoRede() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    return iniciarRede(ref.current)
  }, [])

  return <canvas ref={ref} className="fundo-rede" aria-hidden="true" />
}

export default FundoRede
