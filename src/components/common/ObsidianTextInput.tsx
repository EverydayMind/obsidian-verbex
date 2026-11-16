import { TextComponent } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { useObsidianSetting } from './ObsidianSetting'

type ObsidianTextInputProps = {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  /**
   * Attach an input suggester (e.g. folder autocomplete) to the underlying
   * `<input>`. Receives the input element and an `onSelect` callback that feeds
   * the chosen value back through `onChange`. Return a cleanup function. Wrap in
   * `useCallback` so it stays stable across renders.
   */
  registerSuggest?: (
    inputEl: HTMLInputElement,
    onSelect: (value: string) => void,
  ) => () => void
}

export function ObsidianTextInput({
  value,
  placeholder,
  onChange,
  type,
  registerSuggest,
}: ObsidianTextInputProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setting } = useObsidianSetting()
  const [textComponent, setTextComponent] = useState<TextComponent | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    if (setting) {
      let newTextComponent: TextComponent | null = null
      setting.addText((component) => {
        newTextComponent = component
      })
      setTextComponent(newTextComponent)

      return () => {
        newTextComponent?.inputEl.remove()
      }
    } else if (containerRef.current) {
      const newTextComponent = new TextComponent(containerRef.current)
      setTextComponent(newTextComponent)

      return () => {
        newTextComponent?.inputEl.remove()
      }
    }
  }, [setting])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!textComponent) return
    textComponent.onChange((v) => onChangeRef.current(v))
  }, [textComponent])

  useEffect(() => {
    if (!textComponent) return
    textComponent.setValue(value)
    if (placeholder) textComponent.setPlaceholder(placeholder)
    if (type) textComponent.inputEl.type = type
  }, [textComponent, value, placeholder, type])

  useEffect(() => {
    if (!textComponent || !registerSuggest) return
    return registerSuggest(textComponent.inputEl, (v) => onChangeRef.current(v))
  }, [textComponent, registerSuggest])

  return <div ref={containerRef} />
}
