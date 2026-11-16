import { ToggleComponent } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { useObsidianSetting } from './ObsidianSetting'

type ObsidianToggleProps = {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export function ObsidianToggle({
  value,
  onChange,
  disabled = false,
}: ObsidianToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setting } = useObsidianSetting()
  const [toggleComponent, setToggleComponent] =
    useState<ToggleComponent | null>(null)
  const onChangeRef = useRef(onChange)
  // Obsidian may echo a programmatic setValue through onChange; only user
  // input should reach the caller.
  const syncingRef = useRef(false)

  useEffect(() => {
    if (setting) {
      let newToggleComponent: ToggleComponent | null = null
      setting.addToggle((component) => {
        newToggleComponent = component
      })
      setToggleComponent(newToggleComponent)

      return () => {
        newToggleComponent?.toggleEl.remove()
      }
    } else if (containerRef.current) {
      const newToggleComponent = new ToggleComponent(containerRef.current)
      setToggleComponent(newToggleComponent)

      return () => {
        newToggleComponent?.toggleEl.remove()
      }
    }
  }, [setting])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!toggleComponent) return
    toggleComponent.onChange((v) => {
      if (!syncingRef.current) onChangeRef.current(v)
    })
  }, [toggleComponent])

  useEffect(() => {
    if (!toggleComponent) return
    toggleComponent.setDisabled(disabled)
  }, [toggleComponent, disabled])

  useEffect(() => {
    if (!toggleComponent) return
    syncingRef.current = true
    try {
      toggleComponent.setValue(value)
    } finally {
      syncingRef.current = false
    }
  }, [toggleComponent, value])

  return <div ref={containerRef} style={{ display: 'contents' }} />
}
