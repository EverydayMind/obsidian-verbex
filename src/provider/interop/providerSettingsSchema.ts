import { z } from 'zod'

export type NativeProviderApproval = {
  providerId: string
  enabled: boolean
  approvedDescriptorDigest: string
  approvedPluginVersion: string
  approvedProtocolVersion: number
  disabledToolNames: string[]
  /** Optional original descriptor; informational and verified against the digest. */
  approvedDescriptorJson?: string
  /** Optional SHA-256 of the installed main.js, not the loaded module. */
  approvedArtifactSha256?: string
}
export type CommitGrant = {
  providerId: string
  descriptorDigest: string
  toolNames: string[]
}
const commitGrant = z
  .object({
    providerId: z.string().min(1).max(64),
    descriptorDigest: z.string().regex(/^[0-9a-f]{64}$/),
    toolNames: z.array(z.string().min(1).max(64)).max(64),
  })
  .strict()
export const nativeProviderSettingsSchema = z
  .object({
    browserControl: z.boolean().catch(false).default(false),
    providers: z
      .array(
        z.object({
          providerId: z.string().min(1).max(64),
          enabled: z.boolean(),
          approvedDescriptorDigest: z.string().min(1).max(128),
          approvedPluginVersion: z.string().min(1).max(64),
          approvedProtocolVersion: z.number().int(),
          approvedArtifactSha256: z
            .string()
            .regex(/^[0-9a-f]{64}$/)
            .optional(),
          disabledToolNames: z.array(z.string().max(64)).max(64).default([]),
          approvedDescriptorJson: z
            .string()
            .max(2 * 1024 * 1024)
            .optional()
            .catch(undefined),
        }),
      )
      .max(32)
      .catch([])
      .default([]),
    commitGrants: z.array(commitGrant).max(32).catch([]).default([]),
  })
  .catch({ providers: [], browserControl: false, commitGrants: [] })
  .default({ providers: [], browserControl: false, commitGrants: [] })
