import * as Popover from '@radix-ui/react-popover'
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Coins,
  Cpu,
  Info,
} from 'lucide-react'

import { t } from '../../i18n'
import { ResponseUsage } from '../../types/llm/response'

type LLMResponseInfoProps = {
  usage: ResponseUsage | null
  estimatedPrice: number | null
  model: string | null
}

export default function LLMResponseInfoPopover({
  usage,
  estimatedPrice,
  model,
}: LLMResponseInfoProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="clickable-icon">
          <Info size={12} />
        </button>
      </Popover.Trigger>
      {usage ? (
        <Popover.Content className="verbex-popover-content verbex-llm-info-content">
          <div className="verbex-llm-info-header">
            {t('ui.LLMResponseInfoPopover.information')}
          </div>
          <div className="verbex-llm-info-tokens">
            <div className="verbex-llm-info-tokens-header">
              {t('ui.LLMResponseInfoPopover.tokenCount')}
            </div>
            <div className="verbex-llm-info-tokens-grid">
              <div className="verbex-llm-info-token-row">
                <ArrowUp className="verbex-llm-info-icon--input" />
                <span>{t('ui.LLMResponseInfoPopover.input')}</span>
                <span className="verbex-llm-info-token-value">
                  {usage.prompt_tokens}
                </span>
              </div>
              <div className="verbex-llm-info-token-row">
                <ArrowDown className="verbex-llm-info-icon--output" />
                <span>{t('ui.LLMResponseInfoPopover.output')}</span>
                <span className="verbex-llm-info-token-value">
                  {usage.completion_tokens}
                </span>
              </div>
              <div className="verbex-llm-info-token-row verbex-llm-info-token-total">
                <ArrowRightLeft className="verbex-llm-info-icon--total" />
                <span>{t('ui.LLMResponseInfoPopover.total')}</span>
                <span className="verbex-llm-info-token-value">
                  {usage.total_tokens}
                </span>
              </div>
            </div>
          </div>
          <div className="verbex-llm-info-footer-row">
            <Coins className="verbex-llm-info-icon--footer" />
            <span>{t('ui.LLMResponseInfoPopover.estimatedPrice')}</span>
            <span className="verbex-llm-info-footer-value">
              {estimatedPrice === null
                ? t('ui.LLMResponseInfoPopover.notAvailable')
                : `$${estimatedPrice.toFixed(4)}`}
            </span>
          </div>
          <div className="verbex-llm-info-footer-row">
            <Cpu className="verbex-llm-info-icon--footer" />
            <span>{t('ui.UserMessageActions.model')}</span>
            <span className="verbex-llm-info-footer-value verbex-llm-info-model">
              {model ?? t('ui.LLMResponseInfoPopover.notAvailable')}
            </span>
          </div>
        </Popover.Content>
      ) : (
        <Popover.Content className="verbex-popover-content">
          <div>{t('ui.LLMResponseInfoPopover.noUsage')}</div>
        </Popover.Content>
      )}
    </Popover.Root>
  )
}
