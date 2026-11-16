import { App, SecretComponent, requireApiVersion } from 'obsidian'
import { useEffect, useRef } from 'react'

/** Obsidian owns the value editor. React and plugin settings only see its name. */
export function ObsidianSecretInput({
  app,
  value,
  onChange,
}: {
  app: App
  value: string
  onChange: (name: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const component = useRef<SecretComponent | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange
  useEffect(() => {
    if (
      !container.current ||
      !requireApiVersion('1.11.5') ||
      !app.secretStorage ||
      !SecretComponent
    )
      return
    const element = container.current
    component.current = new SecretComponent(app, element).onChange((name) =>
      changed.current(name ?? ''),
    )
    return () => {
      component.current = null
      element.replaceChildren()
    }
  }, [app])
  useEffect(() => {
    component.current?.setValue(value)
  }, [value])
  return <div ref={container} />
}
