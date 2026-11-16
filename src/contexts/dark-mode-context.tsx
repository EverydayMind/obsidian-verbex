import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { useApp } from './app-context'

type DarkModeContextType = {
  isDarkMode: boolean
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(
  undefined,
)

export function DarkModeProvider({
  children,
  containerEl,
}: {
  children: ReactNode
  containerEl: HTMLElement
}) {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const app = useApp()

  useEffect(() => {
    const doc = containerEl.ownerDocument
    const handleDarkMode = () => {
      setIsDarkMode(doc.body.classList.contains('theme-dark'))
    }
    handleDarkMode()
    app.workspace.on('css-change', handleDarkMode)
    return () => app.workspace.off('css-change', handleDarkMode)
  }, [app, containerEl])

  return (
    <DarkModeContext.Provider value={{ isDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  )
}

export function useDarkModeContext() {
  const context = useContext(DarkModeContext)
  if (context === undefined) {
    throw new Error('useDarkModeContext must be used within a DarkModeProvider')
  }
  return context
}
