import React from 'react'

import VerbexPlugin from '../main'

// Plugin context
const PluginContext = React.createContext<VerbexPlugin | undefined>(undefined)

export const PluginProvider = ({
  children,
  plugin,
}: {
  children: React.ReactNode
  plugin: VerbexPlugin
}) => {
  return (
    <PluginContext.Provider value={plugin}>{children}</PluginContext.Provider>
  )
}

export const usePlugin = () => {
  const plugin = React.useContext(PluginContext)
  if (!plugin) {
    throw new Error('usePlugin must be used within a PluginProvider')
  }
  return plugin
}
