import { ui0 } from './ui-en-0'
import { ui1 } from './ui-en-1'
import { ui10 } from './ui-en-10'
import { ui11 } from './ui-en-11'
import { ui12 } from './ui-en-12'
import { ui2 } from './ui-en-2'
import { ui3 } from './ui-en-3'
import { ui4 } from './ui-en-4'
import { ui5 } from './ui-en-5'
import { ui6 } from './ui-en-6'
import { ui7 } from './ui-en-7'
import { ui8 } from './ui-en-8'
import { ui9 } from './ui-en-9'

export const en = {
  providerR14: {
    versionChanged: 'The target version changed. Review the JSON again.',
    approvalNeeded: 'Approval required',
    disabled: 'Disabled',
    busy: 'Call in progress',
    active: 'Active',
    methodMissing: 'API method unavailable',
    recheck: 'Recheck required',
    error: 'Error',
    editorUnsupported: 'The approved plugin does not support this action.',
    editorBusy:
      'The plugin changed or a previous call is still in progress. Try again shortly.',
    editorChanged:
      'The plugin changed during the call. Check the document state.',
  },
  providerR13: {
    mcpUnavailable: 'The MCP tool is unavailable.',
    mcpChanged: 'The MCP tool changed. Check it again.',
    noChanges: '(No semantic changes)',
    target: 'Target: {path}',
    count: 'Changes: {count}',
    sourceHash: 'Source SHA-256: {hash}',
    resultHash: 'Result SHA-256: {hash}',
    sizes: 'Source size: {source} bytes · Result size: {result} bytes',
    expires: 'Expires: {date}',
    changes: 'Changes (the entire proposal):',
    confirm:
      'Approve this entire binary proposal and overwrite the original HWPX?',
    wholeOnly: 'Approval of individual items is not supported.',
    cell: 'Block {block}, table row {row}, column {col}',
    block: 'Block {block}',
  },
  largeDocumentBadge: {
    badge: '> 📄 Whole-document analysis complete · {p0}{p1}{p2}{p3}',
    outputWarning: ' · ⚠️ Some output may have been truncated',
    projectionWarning:
      ' · ⚠️ Document projection contains only part of the source (incomplete coverage)',
    verified: ' · Cross-verification complete',
    multiScope: '{p0} files · {p1} sections',
    singleScope: '{p0} · {p1} sections',
  },
  tidyR11: {
    title:
      'Changed the title "{display}" to "{title}" to comply with file naming rules ({reasons}). The original spelling is kept in aliases.',
    links:
      'Obsidian will update links in {count} notes that link to this note: {notes}{tail}',
    updateLinks:
      'Obsidian’s "Automatically update internal links" is off, so a link update confirmation dialog will appear during application. Choosing "Do not update" may break links.',
    existing:
      'The "{name}" note already exists ({path}), so only a link is added without creating a new note.',
    create:
      'Create the entity ({type}) note {path} and link the "{mention}" mention in {source}.',
    original: 'Source change: {context}',
    mentions: 'Link {count} mentions in {source} to {entity}{first}.',
    first: ' (first mention only)',
    merge:
      'Merge {source} into {target} (Obsidian Note Composer, {position}). The source is deleted according to Obsidian’s deletion setting ({trash}).',
    prepend: 'prepend',
    append: 'append',
    localTrash: '.trash folder',
    permanent: 'permanent deletion',
    systemTrash: 'system trash',
    exact:
      'Remove {count} blocks identical to the target from the source{details}.',
    extra:
      'Also remove {count} blocks the model judged to be duplicates (review required): {blocks}',
    protected:
      'Keep {count} blocks linked from other notes even if duplicated: {anchors}',
    conflicts: 'For property conflicts ({keys}), {action}.',
    keepTarget: 'keep the target values',
    takeSource: 'use the source values',
    alias: 'Add the source title "{title}" to the target’s aliases.',
    template: 'The Note Composer template will be applied.',
    properties:
      'Property formatting may differ slightly from the preview because Obsidian serializes it again.',
    split:
      'Move part of {source} ({text}) to the new note {path} (Obsidian Note Composer).',
    replacement: 'At the original location, {action} (Note Composer setting).',
    leaveNone: 'leave nothing',
    leaveEmbed: 'leave the embed {replacement}',
    leaveLink: 'leave the link {replacement}',
    rename:
      'Change the title from "{old}" to "{title}" (Obsidian rename, same folder).',
    oldAlias: 'Keep the previous title "{title}" in aliases.',
  },
  nativeProviderR10: {
    undoTargetUnavailable:
      'Cannot verify the target of the previous edit card. Undo directly in the document.',
    undoTargetTimeout: 'Timed out while checking the undo target',
    undoDocumentChanged:
      'The document changed after the edit. Undo directly in the current document.',
    undoReceiptMismatch:
      'The undo receipt does not match the selected edit. Check the state in the document.',
    editorBusy:
      'The plugin changed or a previous call is still in progress. Try clicking again shortly.',
    undoPluginChanged: 'The plugin changed during undo. Check the document.',
    undoResultUnavailable: 'Could not verify the undo result.',
    editorUnavailable:
      'The approved plugin is unavailable. Check the tool settings.',
    invalidDocumentPath: 'The document path is invalid.',
    describeBusy: 'Waiting for the previous provider discovery response',
    describeTimeout: 'describe() response timed out',
    runtimeFault:
      'Unexpected changes were observed during saving: check the files, then reload the provider plugin. The cause of the changes is undetermined.',
    discoveryError: 'Discovery error',
    pending: 'Awaiting approval',
    reapproval: 'Tool definitions or version changed: reapproval required',
    busy: 'Call in progress',
    active: 'Active',
    disabled: 'Disabled',
    error: 'Error',
    duplicateRecords:
      'Approval records are duplicated. Clean up the settings and scan again.',
    providerMissing: 'Cannot find the plugin that provides the tools.',
    definitionsChanged:
      'The tool definitions changed after review. Review them again.',
    duplicateApproval: 'Approval entries are duplicated. Review them again.',
    artifactChanged: 'The reviewed executable has changed. Review it again.',
    artifactBusy: 'The previous executable check has not finished yet.',
    pinnedArtifactUnavailable: 'Cannot verify the pinned plugin executable.',
    artifactPathUnavailable: 'Cannot verify the plugin file path.',
    artifactUnavailable: 'Cannot verify the plugin executable.',
    artifactReadChanged:
      'The plugin executable changed while it was being read.',
    selectAgain: 'Select the approval targets again.',
    approvalMissing:
      'Approval entries are duplicated or missing. Review them again.',
    approvalChanged:
      'The plugin or approval settings changed after review. Review them again.',
    alreadyApproved:
      'A plugin has already been approved with its current definitions. Review it again.',
    initialApprovalExists:
      'An approval record already exists or is duplicated. Review it again.',
    pluginChanged: 'The plugin changed after review. Review it again.',
  },
  browserReadAccessR10: {
    allowed: 'Site reading allowed',
    approval_required: 'Site reading approval required',
    needs_allowlist: 'Site allowlist registration required',
    blocked: 'Blocked site',
    read_disabled: 'Web reading disabled',
    prompt_unavailable: 'Site approval dialog unavailable',
  },
  findingAggregationR8: { issueCount: '{count} issues' },
  commitStatusR7: {
    unavailable: 'Cannot check the save record.',
    invalidId: 'The save record identifier is invalid.',
    notFound: 'Could not find the save record for this conversation.',
    invalidPath: 'The save record path is invalid.',
    restored:
      'This save has been processed for rollback. The original save result is preserved.',
    running:
      'The previous call is still running. Check again after it finishes.',
    diskCompared:
      'Compared the current files against the hashes of the previous contents and the approved save contents.',
    pluginChanged: 'The plugin state has changed. Check again.',
    wrongReceipt: 'This receipt belongs to another save.',
    responseReceived:
      'Received the plugin response; the displayed state was verified using the current file hashes.',
    responseFailed:
      'Could not verify the plugin result. The displayed state is a comparison of the current file hashes.',
    waiting:
      'Waiting for the status query response. Saving will not be retried automatically.',
    diskOnly:
      'The plugin changed or restarted, so only the current file hashes were compared.',
  },
  fileToolR6: {
    rename: '{path} → {newPath}: Rename within the same folder.',
    move: '{path} → {newPath}: Move the file.',
    trash: 'Move {path} to the trash.',
  },
  runtimeR5: {
    checkpoint: 'Checkpoint created: for applying file changes',
    toolPermission: 'Tool write permission approved/executed: {tool} -> {path}',
    workflowMatched: 'Workflow matched: {name}',
    evaluationJson: 'Cannot read retrieval evaluation JSON: {error}',
    evaluationFormat: 'Invalid retrieval evaluation data format: {error}',
    oauthReceived: 'Verbex received the login response. Return to Obsidian.',
    oauthRejected: 'OAuth login was denied. Log in again.',
    oauthCancelled: 'OAuth login was cancelled.',
    oauthTimeout: 'OAuth login timed out. Log in again.',
    oauthCallback: 'Could not open the OAuth callback address.',
    nextMessage: 'Go ahead',
  },
  ui: {
    ...ui0,
    ...ui1,
    ...ui2,
    ...ui3,
    ...ui4,
    ...ui5,
    ...ui6,
    ...ui7,
    ...ui8,
    ...ui9,
    ...ui10,
    ...ui11,
    ...ui12,
  },
  restoreActiveRunCommand: 'Verbex: Restore all active run checkpoints',
  toolBudgetNotice:
    'Tools from {provider} were omitted due to the tool budget. Pin them in the chat Tools menu if needed.',
  settings: {
    documentJobs: {
      title: 'Document jobs',
      baseFontPt: 'Format reuse: base body font size (pt)',
      description:
        'Default: 15 pt. Choose 6–40 pt in 0.5 pt steps. Applies to new jobs.',
    },
    tabs: {
      ariaLabel: 'Verbex settings sections',
      getStarted: 'Get started',
      chat: 'Chat',
      search: 'Search',
      advanced: 'Advanced',
    },
    moreSettings: 'More settings',
    readiness: {
      title: 'Setup status',
      done: 'Done',
      needed: 'Needed',
      providerReady: 'Provider ready: {id}',
      providerNeeded: 'A provider with an API key is needed.',
      chatModelReady: 'Chat model: {id}',
      chatModelNeeded: 'Add a chat model.',
      chatModelProviderNeeded:
        'Chat model {id} cannot be used yet: set up its provider ({providerId}).',
      addChatModel: 'Add model',
      approvalsPending: '{count} plugin(s) waiting for tool approval',
      approvalsNone: 'No plugins waiting for approval.',
      goToToolApproval: 'Go to Tool approval',
      saveToolsOff:
        '{count} save tool(s) are off. Turn them on to let Verbex create or save files.',
    },
    documentSearch: {
      title: 'HWP, HWPX and PDF search',
    },
    groups: {
      tools: 'Tools',
      llm: 'LLM',
      embedding: 'Embedding',
      search: 'Search',
      permissions: 'Permissions',
      context: 'Context',
      advanced: 'Advanced',
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      delete: 'Delete',
      add: 'Add',
      manage: 'Manage',
      edit: 'Edit',
      on: 'On',
      off: 'Off',
      recommended: 'Recommended',
      offlinePackRequired: 'offline pack required',
      enabled: 'enabled',
      disabled: 'disabled',
      inherit: 'inherit provider default ({status})',
      loading: 'Loading...',
      required: 'Required',
      optional: 'optional',
      lastUpdated: 'Last updated: {time}',
    },
    chat: {
      title: 'Chat',
      modelUnsetOption: '(No model selected)',
      chatModel: {
        name: 'Chat model',
        desc: 'Select the primary language model to use for general chat conversations with the agent.',
      },
      applyModel: {
        name: 'Apply model',
        desc: 'Select the model to use for generating and applying file changes (Apply). Specify a more capable model for higher quality code generation.',
      },
      systemPrompt: {
        name: 'System prompt',
        desc: 'Enter the system prompt pre-pended to the beginning of every chat session. Useful for setting global agent roles or tone; runs before workspace-specific prompts.',
      },
      includeCurrentFile: {
        name: 'Include current file',
        desc: 'When enabled, automatically appends the contents of the currently active note to the chat context at startup. Useful for immediate document analysis.',
      },
      enableTools: {
        name: 'Enable tools',
        desc: 'Allow the agent to use Model Context Protocol (MCP) tools. If disabled, the agent will only respond in chat without invoking tools.',
      },
      maxAutoIterations: {
        name: 'Max auto tool requests',
        desc: 'The maximum number of consecutive tool calls the agent can perform autonomously without user approval. Increasing this allows the agent to solve complex tasks independently, but may raise API consumption costs.',
      },
      nextButtonMessage: {
        name: 'NEXT button message',
        desc: "Configure the message template sent automatically when clicking the 'NEXT' button to advance the agent (e.g., 'continue', 'go ahead').",
      },
      minEvidenceReads: {
        name: 'Minimum evidence reads',
        desc: 'Enforce the minimum number of discovered source notes the agent must read before finalizing review reports or evidence synthesis. Set to 0 to skip this safety boundary.',
      },
    },
    agent: {
      title: 'Verbex Workspace',
      agentsMdPath: {
        name: 'System prompt path',
        desc: "Configure the vault-relative path to the agent's system prompt. Changing this alters the agent's persona and core instructions; leave blank to use the default prompt.",
      },
      skillsFolder: {
        name: 'Skills folder',
        desc: 'Specify the folder where custom skill files executable as agent tools are stored. Changing this alters the loaded skills; new vaults default to .verbex/Skills.',
      },
      workflowsFolder: {
        name: 'Workflows folder',
        desc: 'Specify the folder containing workflow YAML files that define multi-step tasks. Changing this alters the list of executable workflows.',
      },
      promptsFolder: {
        name: 'Prompts folder',
        desc: 'Specify the folder containing prompt template files referenced by workflow steps. Changing this alters the prompt formats used during workflow execution.',
      },
      vaultWikiFolder: {
        name: 'Vault summary wiki folder',
        desc: 'Specify the folder containing wiki notes summarizing vault-wide knowledge and context. Configuring this allows the agent to consult these summaries first, accelerating contextual understanding before searching other files.',
      },
    },
    providers: {
      title: 'Providers',
      desc: 'Configure LLM providers. OpenAI is the default; OpenRouter, Anthropic (Claude), Gemini, Ollama, LM Studio, and generic OpenAI-compatible endpoints are also supported. Use “Test connection” after entering credentials to verify a provider.',
      table: {
        id: 'ID',
        type: 'Type',
        apiKey: 'API Key',
        tools: 'Tools',
        actions: 'Actions',
        setApiKey: 'Set API key',
      },
      addCustom: 'Add custom provider',
      deleteConfirm: {
        title: 'Delete Provider',
        message:
          'Are you sure you want to delete provider "{id}"?\n\nThis will also delete:\n- {chatCount} chat model(s)\n- {embedCount} embedding model(s)\n\nAll embeddings generated using the associated embedding models will also be deleted.',
      },
      addCustomModal: 'Add Custom Provider',
      editModal: 'Edit Provider: {id}',
      idField: {
        name: 'ID',
        desc: 'Choose an ID to identify this provider in your settings. This is just for your reference.',
      },
      providerType: 'Provider Type',
      migrationDone:
        'Moved {count} provider API key(s) to the Obsidian keychain. The settings file no longer contains them.',
      migrationFailed:
        'Some provider API keys could not be moved to the keychain. They remain in the settings file: {ids}',
      keychainDesc:
        'Pick or create a secret in the Obsidian keychain. The key value is not written to the settings file.',
      keychainValue: 'Keychain: {name}',
      keychainEmpty: 'Keychain: {name} (no value)',
      apiKeyField: {
        name: 'API Key',
        desc: 'Enter the API key for {providerLabel}',
        placeholder: 'Enter your API Key',
      },
      baseUrlField: {
        name: 'Base URL',
        desc: 'Required for this provider type.',
        optionalDesc: '(leave blank to use {defaultUrl})',
        placeholder: 'Enter base URL',
      },
      advancedTls: 'Advanced (TLS)',
      tlsCaCertField: {
        name: 'CA certificate path (PEM)',
        desc: 'Absolute path to an additional trusted CA certificate. Set this if requests fail with TLS certificate errors (e.g. behind a TLS-inspecting proxy or an internal CA in an air-gapped network).',
      },
      tlsSkipVerifyField: {
        name: 'Skip TLS verification',
        desc: 'Disables TLS certificate verification entirely. Insecure — use only as a last resort when providing a CA certificate is not possible.',
      },
      supportsToolsField: {
        name: 'Supports tools',
        desc: 'Allow chat requests for this provider to include OpenAI-style tool/function definitions. Agent workflows need reliable native tool calls; 7B+ is the practical local-model baseline. Disable this when the prompt template cannot render tools.',
      },
      testing: 'Testing…',
      testConnection: 'Test connection',
      previewModels: {
        button: 'Check model list',
        unsupported: 'This provider does not support listing models.',
        result: 'Found {count} models: {preview}, ...',
      },
      addModelsPrompt: {
        title: 'Add models',
        message:
          'Provider "{id}" was saved. Would you like to add one of its chat models now?',
        ctaText: 'Add models',
      },
      errors: {
        notFound: 'No provider found with this ID',
        alreadyExists:
          'Provider with this ID already exists. Try a different ID.',
        connectionSuccess: 'Connection test succeeded',
        connectionFailed: 'Connection test failed: {message}',
      },
    },
    chatModels: {
      title: 'Chat Models',
      desc: 'Models used for chat and apply',
      table: {
        id: 'ID',
        providerId: 'Provider ID',
        model: 'Model',
        tools: 'Tools',
        enable: 'Enable',
        actions: 'Actions',
      },
      addCustom: 'Add custom model',
      deleteConfirm: {
        title: 'Delete Chat Model',
        message: 'Are you sure you want to delete model "{id}"?',
      },
      addCustomModal: 'Add Custom Chat Model',
      editModal: 'Edit Chat Model: {id}',
      errors: {
        alreadyExists: 'Model with this ID already exists. Try a different ID.',
        providerNotFound: 'Provider with this ID does not exist',
        providerIdNotFound: 'Provider with ID {id} not found',
        noModelsSelected: 'Select at least one model to add.',
        saveFailed: 'Failed to save settings. Check your input and try again.',
      },
      addedNotice: 'Added {count} model(s). Chat model: {name}.',
      discovery: {
        missingProvider: 'No provider is set up yet. Add a provider first.',
        setupProvider: 'Set up this provider',
        enterApiKey: 'Enter API key for {provider}',
        addDifferentProvider: 'Add a different provider',
        addProvider: 'Add a provider',
        missingApiKey:
          'This provider has no API key. Add the key in the provider settings first.',
        missingBaseUrl:
          'This provider has no base URL. Add it in the provider settings first.',
        fetching: 'Fetching model list...',
        fetchedCount: '{count} models',
        curatedBadge: 'Known models (not a live server response)',
        unverifiedBadge: 'Unverified',
        unverifiedTitle:
          'The server listed this model but did not say whether it supports chat. It usually works; verify with a test message.',
        alreadyAdded: 'Already added',
        customInput: 'Enter manually...',
        backToList: 'Choose from list',
        addSelected: 'Add {count} selected',
        retry: 'Retry',
        searchPlaceholder: 'Search models...',
        contextWindow: 'Context: {count} tokens',
        truncated: 'The list was truncated. Try narrowing your search.',
        unsupported:
          'This provider does not support listing models. Enter one manually below.',
        errors: {
          auth: 'Authentication failed. Check the API key.',
          endpoint:
            'The model list endpoint is not available. Enter the model name manually.',
          server: 'Provider server error. Try again later.',
          network:
            'Could not reach the provider. Check the base URL and network connection.',
          empty: 'The provider returned no models.',
          malformed: 'The provider response was not in the expected format.',
        },
      },
      idField: {
        name: 'ID',
        desc: 'Choose an ID to identify this model in your settings. This is just for your reference.',
      },
      providerIdField: 'Provider ID',
      modelNameField: {
        name: 'Model Name',
        placeholder: 'Enter the model name',
      },
      promptLevelField: {
        name: 'Prompt Level',
        desc: 'Choose how complex the system prompt should be. Select "simple" for small models that ignore user questions and just repeat back instructions.',
      },
      promptLevelOptions: {
        default: 'default',
        simple: 'simple',
      },
      supportsToolsField: {
        name: 'Supports tools',
        desc: 'Controls whether this model may receive OpenAI-style tool/function definitions. Inherit uses the provider setting, currently {status}.',
      },
      toolProbe: {
        name: 'Check tool calling',
        structured: 'A structured tool call was returned.',
        text_call:
          'The model emitted a tool call as text and the server did not structure it. Check the server tool call parser settings (vLLM: --enable-auto-tool-choice and --tool-call-parser).',
        no_call:
          'The model did not call the tool in this attempt. One attempt is not conclusive.',
        rejected: 'The server rejected the request containing tools: {message}',
        error: 'Could not check tool calling: {message}',
      },
      browserImagesField: {
        name: 'Send browser images',
        desc: 'Enable only for models that accept image input. Sends screenshots to this model. Off by default.',
      },
      contextWindowField: {
        name: 'Context window (tokens)',
        desc: 'Total tokens (input + output) this model accepts. Used to split files larger than the window into a map-reduce pass instead of failing. Leave blank to auto-detect (currently {autoVal}).',
      },
      toolTurnReasoningEffortField: {
        name: 'Tool-turn reasoning effort',
        desc: 'Applies to tool turns on the selected API. Unset follows the model default. GPT-6 Luna/Sol require explicit none for Chat Completions tools; use Responses to keep reasoning. Astra/6.1 Sol require Responses for tools and do not support none.',
      },
      apiModeField: {
        name: 'API mode',
        desc: 'Used for every request to this model. Existing models keep Chat Completions; new OpenAI models default to Responses. Compatible servers must explicitly support Responses. No automatic fallback.',
      },
      compatibilityAuto: 'Documented model default',
      compatibilityOverrideDesc:
        'Override only when the provider documents different capabilities. Built-in rules apply to official OpenAI models; compatible servers use their own contract.',
      supportsNoneField: { name: 'Supports reasoning effort none' },
      chatToolsField: { name: 'Chat Completions function tools' },
      chatToolsOptions: {
        any: 'Any reasoning effort',
        noneOnly: 'Explicit none only',
        unsupported: 'Use Responses',
      },
      toolTurnReasoningEffortOptions: {
        unset: 'Unset (omit field)',
        none: 'none (disable reasoning)',
        low: 'low',
        medium: 'medium',
        high: 'high',
      },
      errorsDetails: {
        supportsToolsInvalid:
          'Supports tools must be inherit, enabled, or disabled',
        toolTurnReasoningEffortInvalid:
          'Tool-turn reasoning effort must be unset, none, low, medium, high, xhigh, or max',
        contextWindowInvalid:
          'Context window must be a positive whole number of tokens.',
      },
    },
    embeddingModels: {
      title: 'Embedding Models',
      desc: 'Models used for generating embeddings for RAG',
      table: {
        id: 'ID',
        providerId: 'Provider ID',
        model: 'Model',
        dimension: 'Dimension',
        actions: 'Actions',
        totalEmbeddings: 'Total Embeddings',
        sizeMb: 'Size (MB)',
      },
      addCustom: 'Add custom model',
      discovery: {
        selectModel:
          'Select one model. The provider will be probed before saving.',
      },
      deleteConfirm: {
        title: 'Delete Embedding Model',
        message:
          'Are you sure you want to delete embedding model "{id}"?\n\nThis will also delete all embeddings generated using this model from the database.',
      },
      addCustomModal: 'Add Custom Embedding Model',
      idField: {
        name: 'ID',
        desc: 'Choose an ID to identify this model in your settings. This is just for your reference.',
      },
      providerIdField: 'Provider ID',
      modelNameField: {
        name: 'Model Name',
        placeholder: 'Enter the model name',
      },
      outputDimensionsField: {
        name: 'Output Dimensions',
        desc: "Optional. Request a specific output dimension from models that support Matryoshka Representation Learning (MRL), such as OpenAI's text-embedding-3-* or Google's gemini-embedding-001. Leave empty to use the model's default dimension.",
      },
      errors: {
        cannotRemoveSelected:
          'Cannot remove model that is currently selected as Embedding Model',
        cannotRemoveActive:
          'This model is still serving the active index. Complete the selected model’s index rebuild before removing it.',
        alreadyExists: 'Model with this ID already exists. Try a different ID.',
        providerNotFound: 'Provider with this ID does not exist',
        invalidResult: 'Embedding model returned an invalid result',
        providerIdNotFound: 'Provider with ID {id} not found',
        matryoshkaError:
          'Requested output dimension {reqDim}, but the model returned {retDim} dimensions. This model may not support custom output dimensions (Matryoshka Representation Learning). Leave the "Output Dimensions" field empty to use the model\'s default dimension.',
        rebuildFailed: 'Failed to rebuild index',
        removeFailed: 'Failed to remove index',
        unknownError: 'An unknown error occurred',
      },
      actionsAria: {
        refresh: 'Refresh',
        rebuildIndex: 'Rebuild index',
        removeIndex: 'Remove index',
        cancelRebuild: 'Cancel index rebuild',
      },
      performanceWarning: {
        title: 'Performance Warning',
        message:
          'This model outputs {dim} dimensions, but the optimized dimensions for database indexing are: {optDims}.\n\nThis may result in slower search performance.\n\nDo you want to continue anyway?',
      },
    },
    rag: {
      title: 'RAG',
      embeddingModel: {
        name: 'Embedding model',
        desc: 'Select the model to use for generating vector embeddings for knowledge search and RAG. Changing it keeps the current index active; use Manage Embedding Database to explicitly rebuild the new model index. Local multilingual-e5-small FP16 runs offline on Windows x64 and truncates inputs to 512 tokens.',
      },
      localEmbeddingDevice: {
        name: 'Local embedding device',
        desc: 'WebGPU uses the GPU when available and automatically falls back to CPU if initialization or inference fails, or if its output differs from CPU.',
      },
      includePatterns: {
        name: 'Include patterns',
        desc: "Specify glob patterns to include files in indexing (one per line). Leave empty to include all files. Changing this requires running the 'Rebuild entire vault index' command to apply. (e.g., 'notes/**' for files under the notes folder)",
      },
      excludePatterns: {
        name: 'Exclude patterns',
        desc: "Specify glob patterns to exclude files from indexing (one per line). Leave empty to exclude nothing. Changing this requires running the 'Rebuild entire vault index' command to apply.",
      },
      testPatterns: 'Test patterns',
      chunkSize: {
        name: 'Chunk size',
        desc: "Set the character count threshold for text splitting into individual chunks. Changing this alters information granularity and requires 'Rebuild entire vault index' to apply.",
      },
      thresholdTokens: {
        name: 'Threshold tokens',
        desc: 'The token threshold that triggers automatic RAG mode. If the total token count of attached files exceeds this value, only retrieved RAG chunks are injected instead of full file contents to optimize token usage.',
      },
      minSimilarity: {
        name: 'Minimum similarity',
        desc: 'The minimum cosine similarity score required for RAG search results. Higher values filter for more closely related chunks, but may reduce the overall volume of retrieved context.',
      },
      bm25Weight: {
        name: 'BM25 weight (hybrid search)',
        desc: 'Set the hybrid search mixing ratio between embedding similarity and BM25 keyword matching, from 0 to 1. 0 relies solely on semantic embeddings, while 1 uses keyword matching (BM25) only. Scores are max-normalized and combined as (1 - weight) × embedding + weight × BM25.',
      },
      limit: {
        name: 'Limit',
        desc: 'The maximum number of retrieved RAG chunks to include in the prompt context. Increasing this provides more source material but raises token consumption.',
      },
      linkedMarkdownFiles: {
        name: 'Linked markdown files',
        desc: 'The maximum number of additional markdown files to retrieve by following [[wikilinks]] or markdown links present in search results.',
      },
      linkedMarkdownDepth: {
        name: 'Linked markdown depth',
        desc: 'The link traversal depth (hops) starting from the search results. A depth of 1 retrieves only directly linked files.',
      },
      expandGraph: {
        name: 'Structural graph fusion',
        desc: 'Include one-hop wikilink, backlink, and related-chunk candidates in ContextBuilder semantic retrieval. This may read additional vault notes per query.',
      },
      manageDb: 'Manage Embedding Database',
      rebuildIndexModal: {
        title: 'Rebuild Index: {model}',
        message:
          'Are you sure you want to rebuild the index for model "{model}"?\n\nThis will clear all embeddings for this model and regenerate them.',
        cta: 'Rebuild',
      },
      clearIndexModal: {
        title: 'Clear Index: {model}',
        message:
          'Are you sure you want to delete all embeddings for model "{model}"?',
      },
      excludedFilesModal: {
        title: '{count} Files Excluded',
        empty: 'No files match the exclusion patterns',
      },
      includedFilesModal: {
        title: '{count} Files Included',
        noPatterns:
          'No inclusion patterns specified - all files will be included (except those matching exclusion patterns)',
        empty: 'No files match the inclusion patterns',
      },
    },
    search: {
      title: 'Search',
      sectionDesc:
        "Embedding and hybrid search reuse the embedding model, hybrid fusion weight (BM25 weight), and reranker. Choose the embedding model on this Search tab; the weight and other tuning are under 'More settings' on the same tab.",
      searchMode: {
        name: 'Search mode',
        desc: 'How ContextBuilder retrieves notes: lexical BM25, semantic embeddings, or hybrid. Embedding/hybrid require a configured embedding model and fall back to BM25 when unavailable.',
      },
      searchModeOptions: {
        bm25: 'BM25 only (lexical, no embeddings)',
        embedding: 'Embedding only (semantic)',
        hybrid: 'Hybrid (semantic + BM25)',
      },
      bm25TopK: {
        name: 'BM25 top K',
        desc: 'Number of lexical search results used by Verbex ContextBuilder.',
      },
      candidateMultiplier: {
        name: 'Candidate multiplier',
        desc: 'Wider BM25 candidate pool before final context selection.',
      },
      linkExpansionDepth: {
        name: 'Link expansion depth',
        desc: 'How far ContextBuilder follows current-note links.',
      },
      excludePaths: {
        name: 'Exclude paths',
        desc: 'Vault-relative prefixes excluded from the standalone Verbex BM25 index, one per line.',
      },
      excludeTypes: {
        name: 'Exclude note types',
        desc: 'Notes whose "type" property matches one of these values are left out of search, one per line. Letter case is ignored. The default keeps format profile notes, which hold long machine-readable data, out of search results.',
      },
      embeddingModelAndReranker: {
        name: 'Embedding model & reranker',
        desc: "Embedding/hybrid search reuses the RAG section's embedding model, hybrid fusion weight (bm25Weight), and reranker. Configure those in the RAG section.",
      },
      relatedNotesAutoRefresh: {
        name: 'Related Notes auto-refresh',
        desc: 'Refresh the Related Notes pane when the active note changes or is edited.',
      },
      relatedNotesLimit: {
        name: 'Related Notes candidate count',
        desc: 'Number of candidates used to rank similar and related notes. Each list shows at most ten notes.',
      },
    },
    permissionsSection: {
      title: 'Tool Permissions & Auto Mode',
      defaultPermission: {
        name: 'Default permission',
        desc: 'Baseline permission for non-read Local Tools when Auto Mode is off.',
      },
      permissionOptions: {
        read_only: 'Read only',
        diff_only: 'Diff review',
        approve_write: 'Approve writes',
        auto: 'Auto when Auto Mode is enabled',
        session_trust: 'Trust approved categories for session',
        forbidden: 'Forbidden',
      },
      alwaysRequireApproval: {
        name: 'Always require approval',
        desc: 'Force manual Diff review while Auto Mode is off. Auto Mode still shows a cancellable countdown.',
      },
      autoModeDefault: {
        name: 'Auto Mode default',
        desc: 'Start each session with Auto Mode enabled for non-dangerous writes.',
      },
      autoModeTimeout: {
        name: 'Auto Mode timeout',
        desc: 'Seconds before a visible Auto Mode Diff is applied if the user does not reject it.',
      },
      alwaysConfirmCategories: {
        name: 'Always-confirm categories',
        desc: 'Comma-separated operation categories that must never auto-apply.',
      },
      checkpointBeforeWrite: {
        name: 'Restore point before write',
        desc: 'Abort writes if a restore point cannot be created first.',
      },
      allowExternalApiTools: {
        name: 'Allow external API tools',
        desc: 'Allow Local Tools categorized as external_api. Dangerous categories still require explicit approval.',
      },
    },
    context: {
      title: 'Context Budget',
      contextBudgetMode: {
        name: 'Context budget mode',
        desc: 'Use the model input limit automatically, or cap context selection at a tokens budget.',
      },
      contextBudgetOptions: {
        auto: 'Follow model limit',
        custom: 'Custom cap',
      },
      maxContextTokens: {
        name: 'Max context tokens',
        desc: 'Custom cap used only when Context budget mode is Custom cap.',
      },
      splitLargeFiles: {
        name: 'Split large files (map-reduce)',
        desc: 'When an attached file exceeds the model input budget or would crowd out the curated context budget, split it and process every part with a map-reduce pass.',
      },
      attachmentDigestRatio: {
        name: 'Attachment digest ratio',
        desc: 'Fraction of Max context tokens a single attached file may use before it is replaced by a map-reduce digest.',
      },
      currentNoteMode: {
        name: 'Current note mode',
        desc: 'How the active note is injected into automatic context.',
      },
      currentNoteModeOptions: {
        auto: 'Auto',
        fullWhenFits: 'Full when it fits',
        snippet: 'Snippet only',
      },
      currentNoteTokenBudget: {
        name: 'Current note token budget',
        desc: 'Current notes at or below this size are included in full; larger whole-note tasks receive structure plus a focused excerpt.',
      },
      reservedOutputTokens: {
        name: 'Reserved output tokens',
        desc: "Tokens held back from each model's context window for its own output, when deciding whether an input fits or must be split.",
      },
      mapReduceChunkRatio: {
        name: 'Map-reduce chunk ratio',
        desc: 'Fraction of the input budget each map-reduce chunk fills (0.05–1). Lower it (e.g. 0.5) so each LLM call handles a smaller chunk and is less likely to time out; more chunks means more calls.',
      },
      mapReduceStepTimeout: {
        name: 'Map-reduce step timeout (ms)',
        desc: 'Per-call request timeout for map-reduce steps. These long analytical calls get their own timeout, separate from the interactive-chat default. Raise it for large chunks.',
      },
      largeFileConfirmThreshold: {
        name: 'Large-file confirm threshold (chunks)',
        desc: 'Ask before running a whole-document analysis or transform predicted to split into more than this many chunks (≈ LLM calls). 0 disables the prompt (fully automatic). Ordinary large files stay friction-free; only genuinely huge jobs prompt.',
      },
      batchCallsPerTurn: {
        name: 'Batch calls per turn',
        desc: 'Pause a resumable large-document batch at the next slice boundary after this many model calls. 0 disables the call quota.',
      },
      batchWallTimePerTurn: {
        name: 'Batch wall time per turn (ms)',
        desc: 'Pause a resumable large-document batch at the next slice boundary after this elapsed time. 0 disables the time quota.',
      },
      summaryWikiTokenBudget: {
        name: 'Summary wiki token budget',
        desc: 'Budget reserved for automatically selected documents from the configured vault summary wiki.',
      },
      searchResultTokenBudget: {
        name: 'Search result token budget',
        desc: 'Budget reserved for BM25 and linked-note context.',
      },
      skillTokenBudget: {
        name: 'Skill token budget',
        desc: 'Maximum tokens for each selected Skill body injected into the prompt. Oversized instructions are truncated; lower this limit to reduce context use.',
      },
      contextCompaction: {
        name: 'Context compaction',
        desc: 'Enabled for the agent runtime; chat and workflow compaction bridges are still pending.',
      },
    },
    mcp: {
      title: 'MCP (Model Context Protocol)',
      warningCallout:
        'When using tools, the tool response is passed to the language model (LLM). If the tool result contains a large amount of content, this can significantly increase LLM usage and associated costs. Please be mindful when enabling or using tools that may return long outputs.',
      mobileNotSupported: 'MCP is not supported on mobile devices',
      serversTitle: 'MCP Servers',
      addButton: 'Add MCP Server',
      table: {
        server: 'Server',
        status: 'Status',
        enabled: 'Enabled',
        actions: 'Actions',
      },
      actionsAria: {
        edit: 'Edit',
        delete: 'Delete',
      },
      empty: 'No MCP servers found',
      editModal: 'Edit MCP Server',
      deleteConfirm: {
        title: 'Delete MCP Server',
        message: 'Are you sure you want to delete MCP server "{name}"?',
      },
      expanded: {
        tools: 'Tools',
        error: 'Error',
      },
      status: {
        connected: 'Connected',
        connecting: 'Connecting...',
        error: 'Error',
        disconnected: 'Disconnected',
      },
      tool: {
        enabled: 'Enabled',
        autoExecute: 'Auto-execute',
      },
      form: {
        name: {
          name: 'Name',
          desc: 'The name of the MCP server',
          placeholder: "e.g. 'github'",
        },
        parameters: {
          name: 'Parameters',
          desc: 'JSON configuration that defines how to run the MCP server. Format must include:\n- "command": The executable name (e.g., "npx", "node")\n- "args": (Optional) Array of command-line arguments\n- "env": (Optional) Key-value pairs of environment variables',
        },
        validParameters: 'Valid parameters',
        errors: {
          nameRequired: 'Name is required',
          alreadyExists: 'Server with same name already exists',
          parametersRequired: 'Parameters are required',
          parametersMustBeJson: 'Parameters must be valid JSON',
          invalidJsonFormat: 'Invalid JSON format',
          invalidParameters: 'Invalid parameters',
          failedToAdd: 'Failed to add MCP server.',
        },
      },
    },
    templates: {
      title: 'Prompt Templates',
      howToUse:
        'Create templates with reusable content that you can quickly insert into your chat. Type <code>/template-name</code> in the chat input to trigger template insertion. You can also drag and select text in the chat input to reveal a &quot;Create template&quot; button for quick template creation.',
      savedTemplates: 'Saved Templates',
      addButton: 'Add Prompt Template',
      table: {
        name: 'Name',
        actions: 'Actions',
      },
      actionsAria: {
        edit: 'Edit Template',
        delete: 'Delete Template',
      },
      loading: 'Loading templates...',
      empty: 'No templates found',
      deleteConfirm: {
        title: 'Delete Template',
        message: 'Are you sure you want to delete template "{name}"?',
      },
      errors: {
        loadFailed:
          'Failed to load templates. Please try refreshing the settings.',
        deleteFailed: 'Failed to delete template. Please try again.',
      },
    },
    etc: {
      debugMode: {
        name: 'Debug mode',
        desc: 'Enable the run record export button in chat.',
      },
      storeRunBodies: {
        name: 'Store bodies in run records',
        desc: 'Store diagnostic bodies (format job contracts, decomposition judgments, and choice previews) in new turn run records. Conversation content and final answers are saved regardless of this setting. Changing the setting does not alter existing records.',
      },
      title: 'Etc',
      auditLogging: {
        name: 'Context audit logging',
        desc: 'Opt in to a read-only chat panel with turn-level aggregate counts for searches, exclusions, context eviction/compaction, and tool calls. Raw prompts and tool payloads are not stored.',
      },
      resetSettings: {
        name: 'Reset settings',
        desc: 'All settings return to their defaults. Provider API keys, model configuration, and permissions are wiped; this cannot be undone.',
        button: 'Reset',
        confirm: {
          title: 'Reset settings',
          message:
            'Are you sure you want to reset all settings to default values? Provider API keys, model configuration, and permissions are wiped; this cannot be undone.',
          ctaText: 'Reset',
          notice: 'Settings have been reset to defaults',
        },
      },
    },
    openSourceLicenses: {
      title: 'Open-source licenses',
      desc: 'Verbex includes portions or adaptations from the open-source projects below. Their copyright and MIT license notices are included here and in the distributed plugin package.',
      source: 'Source:',
    },
  },
  notices: {
    index: {
      rebuilding: 'Verbex: Rebuilding vault index…',
      updating: 'Verbex: Updating vault index…',
      progress: 'Verbex: Indexing chunks {completed} / {total}',
      rateLimited: '(waiting for the rate limit to reset)',
      rebuilt: 'Verbex: Vault index rebuilt',
      updated: 'Verbex: Vault index updated',
      embeddingFailed:
        'Verbex: The BM25 index is up to date, but the embedding index update failed. Check the embedding model connection in Settings. Details are in the developer console.',
    },
    context: {
      noQuery: 'Verbex: Select text or place the cursor on a query line.',
      built: 'Verbex: Context built with {count} source(s).',
      failed:
        'Verbex: Context build failed. Details are in the developer console.',
    },
    chat: {
      loadFailed: 'Failed to load the conversation.',
      saveFailed: 'Failed to save the chat history.',
    },
  },
  views: {
    common: {
      paneError: 'This pane could not be rendered. Try reopening it.',
    },
    status: {
      title: 'Verbex Status',
      refresh: 'Refresh',
      skills: 'Skills',
      workflows: 'Workflows',
      paused: 'Paused',
      errors: 'Errors',
      bm25Docs: 'BM25 Docs',
      vectorFiles: 'Vector Files',
      vectorChunks: 'Vector Chunks',
      searchIndex: 'Search Index',
      noBm25: 'No BM25 index loaded.',
      noVector: 'No Vector index loaded.',
      vector: 'Vector ({model})',
      storageBreakdown: 'Storage breakdown: {breakdown}',
      contextTrace: 'Context Trace',
      autoContextTokens: '{estimated} / {budget} estimated auto-context tokens',
      autoContextGauge: 'Auto-context utilization: {percent}%',
      autoContextHelp:
        'This measures the latest ContextBuilder payload, not the full conversation transcript.',
      autoContextBudget:
        '{percent}% of the auto-context budget · excludes the conversation transcript and tool schemas',
      previewHelp: 'Run Verbex: Context preview to inspect retrieved sources.',
      activeRun: 'Active Run',
      adHoc: 'ad-hoc',
      noWorkflow: 'no workflow',
      noActiveRun: 'No active run.',
      skillsSection: 'Skills',
      noSkills: 'No skills found.',
      workflowErrors: 'Workflow Errors',
      sources: {
        mentioned: 'Attached',
        current_note: 'Current note',
        wiki: 'Wiki',
        bm25: 'BM25',
        semantic: 'Semantic',
        wikilink: 'WikiLink',
        backlink: 'Backlink',
        tag: 'Tag',
        dataview: 'Dataview',
        base: 'Base',
      },
      readiness: {
        label: 'Readiness',
        ui: 'UI',
        catalog: 'Catalog',
        lexical: 'BM25',
        semantic: 'Semantic',
      },
      providerTools: {
        label: 'Provider Tools',
        registry: 'Provider registry',
        availableCount: 'Available tools',
        protocol: 'Host protocol {protocol} · generation {generation}',
        schema: 'Schema {schema}',
        unavailableHelp: 'The provider registry is not available.',
        noRegistry: 'No provider registry is connected.',
        noProviders: 'No provider is registered yet.',
        states: {
          ready: 'Ready',
          waiting: 'Waiting',
          unavailable: 'Unavailable',
        },
      },
    },
    related: {
      excludeDailyNotes: 'Exclude daily notes',
      title: 'Related Notes',
      openNoteHelp: 'Open a Markdown note to see related notes.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      finding: 'Finding related notes…',
      noNotes: 'No related Markdown notes found.',
      similar: 'Similar notes',
      related: 'Related notes',
      ctrlClickHint:
        'Ctrl/Cmd-click a circle to open that note and keep this graph as it is.',
      signals: {
        vector: 'Vector',
        bm25: 'BM25',
        graph: 'Graph',
      },
    },
  },
}
