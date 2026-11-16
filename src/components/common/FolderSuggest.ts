import { AbstractInputSuggest, App, TFolder } from 'obsidian'

/**
 * Folder autocomplete for a text input, using the typed value as a prefix to
 * propose matching vault folders. This is the standard Obsidian settings
 * technique (`AbstractInputSuggest`) used widely by community plugins for
 * folder-path fields.
 *
 * Matching is case-insensitive: folders whose path starts with the query are
 * proposed first, followed by folders that merely contain it, so a short prefix
 * still surfaces the obvious top-level folder before nested namesakes.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    private readonly inputEl: HTMLInputElement,
    private readonly onSelectFolder: (value: string) => void,
  ) {
    super(app, inputEl)
  }

  protected getSuggestions(query: string): TFolder[] {
    const lowerQuery = query.toLowerCase()
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => folder.path.toLowerCase().includes(lowerQuery))

    folders.sort((a, b) => {
      const aPrefix = a.path.toLowerCase().startsWith(lowerQuery)
      const bPrefix = b.path.toLowerCase().startsWith(lowerQuery)
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
      if (a.path.length !== b.path.length) return a.path.length - b.path.length
      return a.path.localeCompare(b.path)
    })

    return folders
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    // The vault root has an empty path; show it as "/" so it is selectable.
    el.setText(folder.path === '' ? '/' : folder.path)
  }

  selectSuggestion(folder: TFolder): void {
    const value = folder.path
    this.setValue(value)
    this.inputEl.trigger('input')
    this.onSelectFolder(value)
    this.close()
  }
}
