import { useEffect } from 'react'

import type { InteropDiagnostics } from '../../provider/interop/diagnostics'
import type { SessionEditFact } from '../../provider/interop/sessionProtocol'

import SessionEditCard from './SessionEditCard'

export default function DiagnosticSessionEditCard({
  fact,
  conversationId,
  diagnostics,
  onReveal,
  onUndo,
}: {
  fact: SessionEditFact
  conversationId: string
  diagnostics: InteropDiagnostics
  onReveal?: (fact: SessionEditFact) => Promise<{ located: boolean }>
  onUndo?: (
    fact: SessionEditFact,
  ) => Promise<{ undone: boolean; message?: string }>
}) {
  const { path, sessionId, revisionAfter } = fact
  useEffect(() => {
    const span = diagnostics.begin('card', {
      conversationId,
      path,
      sessionId,
      revisionAfter,
    })
    const frame = window.requestAnimationFrame(() => span.finish('frame'))
    return () => {
      window.cancelAnimationFrame(frame)
      span.finish('cancelled')
    }
  }, [diagnostics, conversationId, path, sessionId, revisionAfter])
  return <SessionEditCard fact={fact} onReveal={onReveal} onUndo={onUndo} />
}
