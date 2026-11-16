import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function templateUnavailable(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `템플릿 파일 \`${p0}\`을 읽을 수 없습니다. 파일을 복구하기 전에는 다시 호출하지 않고 사용자에게 알립니다.`,
      en: `Cannot read template file \`${p0}\`. Inform the user without calling again until the file is restored.`,
    },
    locale,
  )
}

export function sampleUnavailable(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `샘플 파일 \`${p0}\`을 읽을 수 없습니다. 사용자에게 알립니다.`,
      en: `Cannot read sample file \`${p0}\`. Inform the user.`,
    },
    locale,
  )
}

export function sampleChanged(locale?: ModelLocale) {
  return L(
    {
      ko: '샘플이 바뀌어 이 작업으로는 다시 만들 수 없습니다. 다시 준비합니다.',
      en: 'The sample changed, so this job cannot produce the output again. Prepare it again.',
    },
    locale,
  )
}

export function draftUnavailable(locale?: ModelLocale) {
  return L(
    { ko: '초안을 읽을 수 없습니다.', en: 'Cannot read the draft.' },
    locale,
  )
}

export function inputChanged(locale?: ModelLocale) {
  return L(
    {
      ko: '입력 파일이 바뀌었습니다. 현재 파일로 다시 호출합니다.',
      en: 'An input file changed. Call again using the current files.',
    },
    locale,
  )
}

export function unchanged(locale?: ModelLocale) {
  return L(
    {
      ko: '호스트가 확인한 두 파일의 해시는 이번 미리보기에 보낸 값과 같습니다(다른 의존 파일은 확인하지 않았습니다). 같은 arguments로 다시 호출하지 말고 이 실패 사실을 사용자에게 알립니다.',
      en: 'The hashes of the two files checked by the host match the values sent for this preview (other dependency files were not checked). Do not call again with the same arguments; inform the user of this failure.',
    },
    locale,
  )
}

export function pending(locale?: ModelLocale) {
  return L(
    {
      ko: '같은 입력으로 미리보기가 실패했습니다. 입력이 바뀌거나 사용자가 다시 시도를 요청할 때만 produce_format_reuse를 호출합니다.',
      en: 'The preview failed with the same inputs. Call produce_format_reuse only when the inputs change or the user requests another attempt.',
    },
    locale,
  )
}
