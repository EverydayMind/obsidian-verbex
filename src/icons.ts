import { addIcon } from 'obsidian'

export const VERBEX_CHAT_ICON = 'verbex-chat-sparkle'
export const VERBEX_RELATED_ICON = 'verbex-related-radial'

// Obsidian custom icons use a 100 × 100 coordinate system. Inherit the
// surrounding UI color so the same artwork works in light and dark themes.
export const VERBEX_CHAT_SVG = `
<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M49 20H23a12 12 0 0 0-12 12v35a12 12 0 0 0 12 12h5v13l18-13h25a12 12 0 0 0 12-12V51"/>
  <path d="M28 47h22M28 61h34"/>
  <path d="m78 8 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z"/>
</g>`

export const VERBEX_RELATED_SVG = `
<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M50 41V19m8 26 19-11M58 55l19 11M50 59v22M42 55 23 66M42 45 23 34"/>
  <circle cx="50" cy="50" r="9"/>
  <circle cx="50" cy="12" r="7"/>
  <circle cx="83" cy="31" r="7"/>
  <circle cx="83" cy="69" r="7"/>
  <circle cx="50" cy="88" r="7"/>
  <circle cx="17" cy="69" r="7"/>
  <circle cx="17" cy="31" r="7"/>
</g>`

export function registerVerbexIcons(): void {
  addIcon(VERBEX_CHAT_ICON, VERBEX_CHAT_SVG)
  addIcon(VERBEX_RELATED_ICON, VERBEX_RELATED_SVG)
}
