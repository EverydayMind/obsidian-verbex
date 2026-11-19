import React, { useRef } from 'react'

export type SettingsTabItem<Id extends string> = {
  id: Id
  label: string
}

type SettingsTabsProps<Id extends string> = {
  tabs: readonly SettingsTabItem<Id>[]
  selected: Id
  onSelect: (id: Id) => void
  ariaLabel: string
  children: React.ReactNode
}

const tabElementId = (id: string) => `verbex-settings-tab-${id}`
const panelElementId = (id: string) => `verbex-settings-tabpanel-${id}`

/** Tab bar with roving tabindex; only the selected tab's panel is rendered. */
export function SettingsTabs<Id extends string>({
  tabs,
  selected,
  onSelect,
  ariaLabel,
  children,
}: SettingsTabsProps<Id>) {
  const listRef = useRef<HTMLDivElement>(null)

  const move = (event: React.KeyboardEvent, index: number) => {
    const last = tabs.length - 1
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1
    if (next < 0) return
    event.preventDefault()
    onSelect(tabs[next].id)
    const buttons =
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }

  return (
    <>
      <div
        className="verbex-settings-tabs"
        role="tablist"
        aria-label={ariaLabel}
        ref={listRef}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabElementId(tab.id)}
            className="verbex-settings-tab"
            aria-selected={tab.id === selected}
            aria-controls={
              tab.id === selected ? panelElementId(tab.id) : undefined
            }
            tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => move(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="verbex-settings-tabpanel"
        role="tabpanel"
        id={panelElementId(selected)}
        aria-labelledby={tabElementId(selected)}
      >
        {children}
      </div>
    </>
  )
}
