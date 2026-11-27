import {
  type App,
  Component,
  MarkdownRenderer,
  type Plugin,
  parseYaml,
  stringifyYaml,
} from 'obsidian'

import {
  corePluginInstanceEvenIfDisabled,
  enabledCorePlugin,
} from '../obsidian-core/internalPlugins'

import { type EvaluatedView, buildEvaluatedView } from './basesEngineResult'
import {
  type PendingBasesRequest,
  type RawViewSnapshot,
  VERBEX_BASES_VIEW_TYPE,
  VerbexBasesReaderView,
} from './basesEngineView'

export type {
  EvaluatedGroup,
  EvaluatedProperty,
  EvaluatedRow,
  EvaluatedView,
} from './basesEngineResult'
export { VERBEX_BASES_VIEW_TYPE } from './basesEngineView'

export type BasesEvaluateRequest = {
  definition: string
  view?: string
  sourcePath: string
  signal?: AbortSignal
}

export type BasesEvaluateResult =
  | { kind: 'ok'; views: EvaluatedView[] }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'view_not_found'; available: string[] }
  | { kind: 'aborted' }

type RawViewObject = Record<string, unknown> & {
  name?: unknown
  type?: unknown
  limit?: unknown
  groupBy?: unknown
}

const DEFAULT_TIMEOUT_MS = 8_000
/** Without a Verbex view in the element by then, Bases did not take the block. */
const VIEW_CREATION_TIMEOUT_MS = 2_000
/** How long to skip the engine after Bases stopped rendering code blocks. */
const BLOCK_RENDERER_RETRY_MS = 5 * 60_000

/** The Bases core plugin instance, as far as Verbex reads it. */
type BasesInstance = {
  getRegistration?: (viewId: string) => unknown
  deregisterView?: (viewId: string) => void
}
const OFFSCREEN_STYLE =
  'position:fixed;left:-10000px;top:0;width:800px;height:600px;overflow:hidden'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function viewLabel(view: RawViewObject): string {
  if (typeof view.name === 'string' && view.name.trim().length > 0) {
    return view.name
  }
  if (typeof view.type === 'string' && view.type.trim().length > 0) {
    return view.type
  }
  return 'view'
}

export class BasesEngine {
  private registered = false
  private registration: object | null = null
  /**
   * After Bases is turned off and on, Obsidian no longer renders ```base code
   * blocks until restart even though our view is registered. Remember that for
   * a while instead of waiting for the view on every call.
   */
  private blockRendererBrokenUntil = 0
  private readonly pending = new Map<HTMLElement, PendingBasesRequest>()

  constructor(
    private readonly plugin: Pick<
      Plugin,
      'registerBasesView' | 'addChild' | 'removeChild'
    >,
    private readonly app: App,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  private findPendingFor = (
    containerEl: HTMLElement,
  ): PendingBasesRequest | null => {
    for (const [host, request] of this.pending) {
      if (host === containerEl || host.contains(containerEl)) {
        request.viewCreated = true
        return request
      }
    }
    return null
  }

  /** Bases did not create our view for a rendered block. */
  private noteViewNotCreated(): void {
    const bases = enabledCorePlugin(this.app, 'bases') as BasesInstance | null
    const stillRegistered =
      typeof bases?.getRegistration === 'function' &&
      !!this.registration &&
      bases.getRegistration(VERBEX_BASES_VIEW_TYPE) === this.registration
    if (stillRegistered)
      this.blockRendererBrokenUntil = Date.now() + BLOCK_RENDERER_RETRY_MS
    else this.registered = false
  }

  /**
   * Bases clears every plugin's view registration when it is turned off and
   * does not restore them when it is turned on again, so the registration is
   * checked on the Bases instance before each use, not only remembered.
   */
  private ensureRegistered(): { ok: true } | { ok: false; reason: string } {
    const bases = enabledCorePlugin(this.app, 'bases') as BasesInstance | null
    if (
      !bases &&
      corePluginInstanceEvenIfDisabled(this.app, 'bases') !== undefined
    ) {
      this.registered = false
      return { ok: false, reason: 'bases_plugin_disabled' }
    }
    if (Date.now() < this.blockRendererBrokenUntil) {
      return { ok: false, reason: 'view_not_created' }
    }
    if (typeof bases?.getRegistration === 'function') {
      const current = bases.getRegistration(VERBEX_BASES_VIEW_TYPE)
      if (current && current === this.registration) {
        this.registered = true
        return { ok: true }
      }
      // Gone after Bases was turned off, or left by an earlier Verbex
      // instance. Registering an existing id makes Bases show an error notice.
      if (current) bases.deregisterView?.(VERBEX_BASES_VIEW_TYPE)
      this.registered = false
    }
    if (this.registered) return { ok: true }
    if (typeof this.plugin.registerBasesView !== 'function') {
      return { ok: false, reason: 'registerBasesView_unavailable' }
    }
    try {
      const registration = {
        name: 'Verbex AI reader',
        icon: 'bot',
        factory: (
          controller: ConstructorParameters<typeof VerbexBasesReaderView>[0],
          containerEl: HTMLElement,
        ) =>
          new VerbexBasesReaderView(
            controller,
            containerEl,
            this.findPendingFor,
          ),
      }
      const ok = this.plugin.registerBasesView(
        VERBEX_BASES_VIEW_TYPE,
        registration,
      )
      if (!ok) return { ok: false, reason: 'bases_plugin_disabled' }
      this.registered = true
      this.registration =
        (typeof bases?.getRegistration === 'function'
          ? (bases.getRegistration(VERBEX_BASES_VIEW_TYPE) as object | null)
          : null) ?? registration
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async evaluate(request: BasesEvaluateRequest): Promise<BasesEvaluateResult> {
    if (request.signal?.aborted) return { kind: 'aborted' }
    const registration = this.ensureRegistered()
    if (!registration.ok) {
      return { kind: 'unavailable', reason: registration.reason }
    }
    if (typeof document === 'undefined' || !document.body) {
      return { kind: 'unavailable', reason: 'dom_unavailable' }
    }

    let parsed: unknown
    try {
      parsed = parseYaml(request.definition)
    } catch {
      return { kind: 'unavailable', reason: 'invalid_yaml' }
    }
    const baseObj = parsed == null ? {} : parsed
    if (!isRecord(baseObj)) {
      return { kind: 'unavailable', reason: 'invalid_definition' }
    }

    const rawViews: RawViewObject[] =
      Array.isArray(baseObj.views) && baseObj.views.length > 0
        ? baseObj.views.filter(isRecord)
        : [{ type: 'table' }]

    let targetViews = rawViews
    const requestedView = request.view?.trim()
    if (requestedView) {
      targetViews = rawViews.filter(
        (view) =>
          typeof view.name === 'string' &&
          view.name.localeCompare(requestedView, undefined, {
            sensitivity: 'accent',
          }) === 0,
      )
      if (targetViews.length === 0) {
        const available = rawViews
          .map((view) => (typeof view.name === 'string' ? view.name : ''))
          .filter((name) => name.length > 0)
        return { kind: 'view_not_found', available }
      }
    }

    const evaluated: EvaluatedView[] = []
    for (const view of targetViews) {
      if (request.signal?.aborted) return { kind: 'aborted' }
      const one = await this.evaluateSingleView(
        baseObj,
        view,
        request.sourcePath,
        request.signal,
      )
      if (one.kind !== 'ok') return one
      evaluated.push(one.view)
    }
    return { kind: 'ok', views: evaluated }
  }

  private async evaluateSingleView(
    baseObj: Record<string, unknown>,
    view: RawViewObject,
    sourcePath: string,
    signal?: AbortSignal,
  ): Promise<
    | { kind: 'ok'; view: EvaluatedView }
    | { kind: 'unavailable'; reason: string }
    | { kind: 'aborted' }
  > {
    const rawLimit =
      typeof view.limit === 'number' &&
      Number.isFinite(view.limit) &&
      view.limit >= 0
        ? Math.floor(view.limit)
        : undefined
    const modifiedView: Record<string, unknown> = {
      ...view,
      type: VERBEX_BASES_VIEW_TYPE,
    }
    delete modifiedView.limit
    const singleBase = { ...baseObj, views: [modifiedView] }
    const markdown = `\`\`\`base\n${stringifyYaml(singleBase)}\`\`\``

    const element = document.createElement('div')
    element.style.cssText = OFFSCREEN_STYLE
    document.body.appendChild(element)

    const component = new Component()
    if (typeof this.plugin.addChild === 'function') {
      this.plugin.addChild(component)
    } else {
      component.load?.()
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let viewTimer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    type WaitOutcome =
      | { kind: 'data'; snapshot: RawViewSnapshot }
      | { kind: 'timeout' }
      | { kind: 'aborted' }
      | { kind: 'error'; reason: string }

    let resolveWait!: (outcome: WaitOutcome) => void
    const waitPromise = new Promise<WaitOutcome>((resolve) => {
      resolveWait = resolve
    })

    const pendingEntry: PendingBasesRequest = {
      settled: false,
      resolve: (snapshot) => resolveWait({ kind: 'data', snapshot }),
    }
    this.pending.set(element, pendingEntry)

    try {
      if (signal) {
        if (signal.aborted) return { kind: 'aborted' }
        onAbort = () => {
          pendingEntry.settled = true
          resolveWait({ kind: 'aborted' })
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      timer = setTimeout(() => {
        if (pendingEntry.settled) return
        pendingEntry.settled = true
        if (!pendingEntry.viewCreated) this.noteViewNotCreated()
        resolveWait({ kind: 'timeout' })
      }, this.timeoutMs)
      viewTimer = setTimeout(
        () => {
          if (pendingEntry.settled || pendingEntry.viewCreated) return
          pendingEntry.settled = true
          this.noteViewNotCreated()
          resolveWait({ kind: 'error', reason: 'view_not_created' })
        },
        Math.min(VIEW_CREATION_TIMEOUT_MS, this.timeoutMs),
      )

      try {
        await MarkdownRenderer.render(
          this.app,
          markdown,
          element,
          sourcePath,
          component,
        )
      } catch (error) {
        if (signal?.aborted) return { kind: 'aborted' }
        if (!pendingEntry.settled) {
          pendingEntry.settled = true
          return {
            kind: 'unavailable',
            reason: error instanceof Error ? error.message : String(error),
          }
        }
      }

      const outcome = await waitPromise
      if (outcome.kind === 'aborted') return { kind: 'aborted' }
      if (outcome.kind === 'timeout') {
        return { kind: 'unavailable', reason: 'timeout' }
      }
      if (outcome.kind === 'error') {
        return { kind: 'unavailable', reason: outcome.reason }
      }

      const hasGroupByConfig =
        isRecord(view.groupBy) && typeof view.groupBy.property === 'string'
      return {
        kind: 'ok',
        view: buildEvaluatedView(
          viewLabel(view),
          outcome.snapshot,
          hasGroupByConfig,
          rawLimit,
        ),
      }
    } finally {
      pendingEntry.settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (viewTimer !== undefined) clearTimeout(viewTimer)
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      this.pending.delete(element)
      if (typeof this.plugin.removeChild === 'function') {
        this.plugin.removeChild(component)
      } else {
        component.unload?.()
      }
      element.remove()
    }
  }
}
