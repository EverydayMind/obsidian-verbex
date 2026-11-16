import { documentJobProduceHost } from './documentJobProduceHost'
import { documentJobSaveHost } from './documentJobSaveHost'
import type { NativeProviderHost } from './NativeProviderHost'

export function documentJobMutation(
  host: NativeProviderHost,
  name: string,
  args: Record<string, unknown>,
  context: Parameters<ReturnType<typeof documentJobProduceHost>['produce']>[1],
) {
  return name === 'save_format_decomposition'
    ? documentJobSaveHost(host).save(args, context)
    : documentJobProduceHost(host).produce(args, context)
}
