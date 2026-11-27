export const ui14 = {
  nativeSkills: {
    skillCount: '{count} skills',
    skillOnly: 'Skill-only provider (no tools)',
    colLocale: 'Language',
    colName: 'Name',
    colDescription: 'Description',
    colTokens: 'Body tokens',
    colExposure: 'Settings that widen exposure',
    noExposure: '(none)',
    extractLine: 'Document text extraction: {extensions}',
    unavailableNow: 'Unavailable now: {reason}',
    unavailableNoReason: 'Unavailable now',
    viewBody: 'View body',
    hideBody: 'Hide body',
    bodyLoading: 'Reading the body.',
    bodyDisplayOnly:
      'Shown on this screen only and never used in a model request. Displayed as plain text.',
    bodyVerified:
      'Verified: the body hash and token count match the declaration.',
    bodyUnverified: 'Could not be verified: {reason}',
    writeTool: 'Write tool',
    reason: {
      hash_mismatch: 'The body hash differs from the declaration.',
      token_mismatch: 'The body token count differs from the declaration.',
      token_unavailable: 'The token count could not be computed.',
      invalid_body: 'The body format is not valid.',
      timeout: 'The plugin did not answer in time.',
      read_error: 'The body could not be read.',
      not_current: 'The plugin changed, so it cannot be read now.',
    },
  },
  pluginSkills: {
    vaultGroup: 'Vault Skills',
    refreshCommand: 'Refresh Skill list',
    refreshed: 'Skill list refreshed.',
    refreshFailed:
      'Plugin Skills could not be loaded. Only vault Skills are shown.',
  },
  basesReader: {
    notice:
      'Verbex uses this view type for AI reading. Switch to the table view.',
    rowCount: '{count} rows',
  },
}
