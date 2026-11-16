import type { RequestTool } from '../../types/llm/request'

import type { ToolRegistryEntry } from './toolCatalogRegistry'

export function reportStyleToolRegistry(
  definitions: RequestTool[],
): Record<string, Omit<ToolRegistryEntry, 'definition'>> {
  return Object.fromEntries(
    definitions.map((definition) => {
      const name = definition.function.name,
        read =
          name === 'read_style_profile' ||
          name === 'compare_style_profile' ||
          name === 'check_report_draft'
      return [
        name,
        {
          category: read ? 'read' : 'write',
          // P5 / D3: retain workflow execution for one release only.
          agentCallable: false,
          workflowCallable: true,
          ...(read
            ? {
                evidenceRole: 'reading' as const,
                evictionKind: 'file_body' as const,
                evictable: true,
                pathArgs:
                  name === 'check_report_draft'
                    ? [
                        'profile_path',
                        'draft_path',
                        'template_path',
                        'baseline_path',
                      ]
                    : ['profile_path'],
              }
            : {}),
        },
      ]
    }),
  )
}
