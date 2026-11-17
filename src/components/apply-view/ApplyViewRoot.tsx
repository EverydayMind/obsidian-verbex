import { CheckIcon, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Notice, getIcon } from 'obsidian'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ApplyViewState } from '../../ApplyView'
import { useApp } from '../../contexts/app-context'
import { t } from '../../i18n'
import { issueApplyPermit } from '../../security/promptInjectionBoundary'
import { DiffBlock, createDiffBlocks } from '../../utils/chat/diff'
import { VaultChangeApplier } from '../../workflow/changeApplier'

export default function ApplyViewRoot({
  state,
  close,
}: {
  state: ApplyViewState
  close: () => void
}) {
  const acceptIcon = getIcon('check')
  const rejectIcon = getIcon('x')
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0)
  const diffBlockRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollerRef = useRef<HTMLDivElement>(null)

  const app = useApp()

  const [diff, setDiff] = useState<DiffBlock[]>(
    createDiffBlocks(state.originalContent, state.newContent),
  )
  const modifiedBlockIndices = useMemo(
    () =>
      diff.reduce<number[]>((acc, block, index) => {
        if (block.type !== 'unchanged') {
          acc.push(index)
        }
        return acc
      }, []),
    [diff],
  )

  const scrollToDiffBlock = useCallback(
    (index: number) => {
      if (index >= 0 && index < modifiedBlockIndices.length) {
        const element = diffBlockRefs.current[modifiedBlockIndices[index]]
        if (element) {
          element.scrollIntoView({ block: 'start' })
          setCurrentDiffIndex(index)
        }
      }
    },
    [modifiedBlockIndices],
  )

  const handlePrevDiff = useCallback(() => {
    scrollToDiffBlock(currentDiffIndex - 1)
  }, [currentDiffIndex, scrollToDiffBlock])

  const handleNextDiff = useCallback(() => {
    scrollToDiffBlock(currentDiffIndex + 1)
  }, [currentDiffIndex, scrollToDiffBlock])

  const handleAccept = async () => {
    const newContent = diff
      .map((diffBlock) => {
        if (diffBlock.type === 'modified') {
          return diffBlock.modifiedValue
        } else {
          return diffBlock.value
        }
      })
      .join('\n')
    const current = await app.vault.cachedRead(state.file)
    if (
      current.replace(/\r\n/g, '\n') !==
      state.originalContent.replace(/\r\n/g, '\n')
    ) {
      new Notice(t('ui.ApplyViewRoot.fileChanged'))
      return
    }
    try {
      const change = {
        id: `apply-view:${state.file.path}`,
        op: 'modify' as const,
        kind: 'body' as const,
        path: state.file.path,
        before: state.originalContent,
        after: newContent,
        dangerous: false,
        tool: 'apply_view',
      }
      const execution = await issueApplyPermit(
        change,
        'ui-apply',
        state.file.path,
      )
      await new VaultChangeApplier(app).apply(change, newContent, execution, {
        runId: 'ui-apply',
        turnId: state.file.path,
      })
      close()
    } catch (error) {
      new Notice(
        t('ui.ApplyViewRoot.failed', {
          p0: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  const handleReject = async () => {
    close()
  }

  const acceptCurrentBlock = (index: number) => {
    setDiff((prevDiff) => {
      const currentPart = prevDiff[index]

      if (currentPart.type === 'unchanged') {
        // Should not happen
        return prevDiff
      }

      if (!currentPart.originalValue) {
        return [...prevDiff.slice(0, index), ...prevDiff.slice(index + 1)]
      }

      const newPart: DiffBlock =
        currentPart.type === 'modified'
          ? {
              type: 'unchanged',
              value: currentPart.originalValue,
            }
          : currentPart

      return [
        ...prevDiff.slice(0, index),
        newPart,
        ...prevDiff.slice(index + 1),
      ]
    })
  }

  const acceptIncomingBlock = (index: number) => {
    setDiff((prevDiff) => {
      const currentPart = prevDiff[index]

      if (currentPart.type === 'unchanged') {
        // Should not happen
        return prevDiff
      }

      if (!currentPart.modifiedValue) {
        return [...prevDiff.slice(0, index), ...prevDiff.slice(index + 1)]
      }

      const newPart: DiffBlock =
        currentPart.type === 'modified'
          ? {
              type: 'unchanged',
              value: currentPart.modifiedValue,
            }
          : currentPart

      return [
        ...prevDiff.slice(0, index),
        newPart,
        ...prevDiff.slice(index + 1),
      ]
    })
  }

  const acceptBothBlocks = (index: number) => {
    setDiff((prevDiff) => {
      const currentPart = prevDiff[index]

      if (currentPart.type === 'unchanged') {
        // Should not happen
        return prevDiff
      }

      const newPart: DiffBlock = {
        type: 'unchanged',
        value: [currentPart.originalValue, currentPart.modifiedValue]
          .filter(Boolean)
          .join('\n'),
      }

      return [
        ...prevDiff.slice(0, index),
        newPart,
        ...prevDiff.slice(index + 1),
      ]
    })
  }

  const updateCurrentDiffFromScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const scrollerRect = scroller.getBoundingClientRect()
    const scrollerTop = scrollerRect.top
    const visibleThreshold = 10 // pixels from top to consider element "visible"

    // Find the first visible diff block
    for (let i = 0; i < modifiedBlockIndices.length; i++) {
      const element = diffBlockRefs.current[modifiedBlockIndices[i]]
      if (!element) continue

      const rect = element.getBoundingClientRect()
      const relativeTop = rect.top - scrollerTop

      // If element is visible (slightly below the top of the viewport)
      if (relativeTop >= -visibleThreshold) {
        setCurrentDiffIndex(i)
        break
      }
    }
  }, [modifiedBlockIndices])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const handleScroll = () => {
      updateCurrentDiffFromScroll()
    }

    scroller.addEventListener('scroll', handleScroll)
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [updateCurrentDiffFromScroll])

  useEffect(() => {
    if (modifiedBlockIndices.length > 0) {
      scrollToDiffBlock(0)
    }
  }, [])

  return (
    <div id="verbex-apply-view">
      <div className="view-header">
        <div className="view-header-title-container mod-at-start">
          <div className="view-header-title">
            {t('ui.ApplyViewRoot.applying', { p0: state?.file?.name ?? '' })}
          </div>
          <div className="view-actions">
            <div className="verbex-diff-navigation">
              <button
                className="clickable-icon"
                onClick={handlePrevDiff}
                disabled={currentDiffIndex <= 0}
                aria-label={t('ui.ApplyViewRoot.previousDiff')}
              >
                <ChevronUp size={14} />
              </button>
              <span>
                {modifiedBlockIndices.length > 0
                  ? t('ui.ApplyViewRoot.position', {
                      p0: currentDiffIndex + 1,
                      p1: modifiedBlockIndices.length,
                    })
                  : t('ui.ApplyViewRoot.position', { p0: 0, p1: 0 })}
              </span>
              <button
                className="clickable-icon"
                onClick={handleNextDiff}
                disabled={currentDiffIndex >= modifiedBlockIndices.length - 1}
                aria-label={t('ui.ApplyViewRoot.nextDiff')}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <button
              className="clickable-icon view-action"
              aria-label={t('ui.ApplyViewRoot.acceptChanges')}
              onClick={() => {
                void handleAccept()
              }}
            >
              {acceptIcon && <CheckIcon size={14} />}
              {t('ui.ApplyViewRoot.accept')}
            </button>
            <button
              className="clickable-icon view-action"
              aria-label={t('ui.ApplyViewRoot.cancelApply')}
              onClick={() => {
                void handleReject()
              }}
            >
              {rejectIcon && <X size={14} />}
              {t('ui.InlinePromptModal.cancel')}
            </button>
          </div>
        </div>
      </div>

      <div className="view-content">
        <div className="markdown-source-view cm-s-obsidian mod-cm6 node-insert-event is-readable-line-width is-live-preview is-folding show-properties">
          <div className="cm-editor">
            <div className="cm-scroller" ref={scrollerRef}>
              <div className="cm-sizer">
                <div className="verbex-inline-title">
                  {state?.file?.name
                    ? state.file.name.replace(/\.[^/.]+$/, '')
                    : ''}
                </div>

                {diff.map((block, index) => (
                  <DiffBlockView
                    key={index}
                    block={block}
                    onAcceptIncoming={() => acceptIncomingBlock(index)}
                    onAcceptCurrent={() => acceptCurrentBlock(index)}
                    onAcceptBoth={() => acceptBothBlocks(index)}
                    ref={(el) => {
                      diffBlockRefs.current[index] = el
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const DiffBlockView = forwardRef<
  HTMLDivElement,
  {
    block: DiffBlock
    onAcceptIncoming: () => void
    onAcceptCurrent: () => void
    onAcceptBoth: () => void
  }
>(({ block: part, onAcceptIncoming, onAcceptCurrent, onAcceptBoth }, ref) => {
  if (part.type === 'unchanged') {
    return (
      <div className="verbex-diff-block">
        <div style={{ width: '100%' }}>{part.value}</div>
      </div>
    )
  } else if (part.type === 'modified') {
    return (
      <div className="verbex-diff-block-container" ref={ref}>
        {part.originalValue && part.originalValue.length > 0 && (
          <div className="verbex-diff-block removed">
            <div style={{ width: '100%' }}>{part.originalValue}</div>
          </div>
        )}
        {part.modifiedValue && part.modifiedValue.length > 0 && (
          <div className="verbex-diff-block added">
            <div style={{ width: '100%' }}>{part.modifiedValue}</div>
          </div>
        )}
        <div className="verbex-diff-block-actions">
          <button onClick={onAcceptIncoming} className="verbex-accept">
            {t('ui.ApplyViewRoot.acceptIncoming')}
          </button>
          <button onClick={onAcceptCurrent} className="verbex-exclude">
            {t('ui.ApplyViewRoot.acceptCurrent')}
          </button>
          <button onClick={onAcceptBoth}>
            {t('ui.ApplyViewRoot.acceptBoth')}
          </button>
        </div>
      </div>
    )
  }
})

DiffBlockView.displayName = 'DiffBlockView'
