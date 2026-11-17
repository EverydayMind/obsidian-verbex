# Verbex

[한국어](README.ko.md)

Verbex is an AI agent for document work that uses your vault as its workspace. It answers from your notes, data files and documents, and when it changes a file it shows the change as a diff and applies it only after you approve.

Desktop only. The interface and the agent follow the app language: Korean when Obsidian is set to Korean, English otherwise.

## What it does

- **Chat grounded in the vault.** Ask in plain language. The agent searches and reads notes, frontmatter properties, tasks, links, Bases and CSV files, and cites the notes it used.
- **Edits with approval.** Creating, rewriting, moving, renaming and deleting notes go through a diff review. Every applied change gets a checkpoint, so you can restore the previous state.
- **Facts from tools, not guesses.** Counting, aggregation, date arithmetic and link audits are done by deterministic tools and quoted, instead of being estimated by the model.
- **Skills and Workflows.** Reusable instructions (`.verbex/Skills/<name>/SKILL.md`) and multi-step workflows (`.verbex/Workflows/*.workflow.yaml`) live in your vault as plain files. The Skill layout is compatible with Claude Code skills.
- **Search.** Keyword (BM25) search works out of the box. Embedding search is optional and can use a provider you configure.
- **Tools from other plugins.** Companion plugins expose their tools to the agent after you approve them (see below). MCP servers are supported too.
- **Inline writing.** Continue writing at the cursor or rewrite the selection from the command palette.

## Getting started

Installing from Community plugins gives you keyword (BM25) search. Semantic search needs the offline pack from the release page or an embedding provider.

1. Install **Verbex** from Community plugins and enable it.
2. Open **Settings → Verbex**, and in the Providers section add a model provider and pick or create its API key (the key is kept in Obsidian's keychain). Supported: OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, LM Studio and any OpenAI-compatible endpoint.
3. Add a chat model for that provider and select it.
4. Run **Open chat** from the command palette and ask something about your vault, for example: `Which meeting notes from October still have unchecked action items?`

Verbex was developed and tested mostly with open-weight models with tool calling (Gemma 4 31B). Larger models work as well. On OpenRouter, the upstream provider that serves an open-weight model affects how reliably it calls tools; if a model often announces a tool call and stops, restrict the upstream providers in your OpenRouter account's routing settings.

### Manual installation

Copy `main.js`, `manifest.json` and `styles.css` from a release into `.obsidian/plugins/verbex/` and enable the plugin.

### Offline pack (Windows x64, optional)

Each release also has `verbex-<version>-offline-windows-x64.zip`. It contains the same plugin plus the files the plugin otherwise downloads on demand (database runtime, tokenizer table) and a local embedding runtime (Node.js, ONNX Runtime and the `multilingual-e5-small` model). Extract it into `.obsidian/plugins/verbex/` if the computer has no internet access or if you want embeddings computed locally.

## Companion plugins

These are separate community plugins. Verbex works without them; install the ones you need and approve their tools in the Tools section of **Settings → Verbex**.

| Plugin | Adds |
| --- | --- |
| Chart Hands | CSV analysis and Plotly charts in notes |
| KorDoc Transform | Reading HWP, HWPX, PDF and Office files |
| HWP Hands | Opening and editing Hangul HWP/HWPX documents |
| HWPX Exporter | Exporting notes to HWPX and reusing an existing document's formatting |

A tool from another plugin is not visible to the model until you approve that plugin, and tools that save files need a separate permission. HWP Hands exposes only reading tools by default: turn on **Allow AI agent editing tools** (and, to save, **Allow AI agent save tool**) in the HWP Hands settings, reload HWP Hands, then approve it again in Verbex.

## Safety

- Files in your vault change only through permission check → approval → checkpoint → apply. Delete and move always ask, even in auto mode.
- Applied changes can be restored from checkpoints.
- Provider API keys are stored in Obsidian's keychain (Settings → Keychain), not in the plugin's settings file, and are redacted from run records and logs. Each device needs its own keys.

## Disclosures

- **Network use.** Your request and the note content the agent selects are sent to the model provider you configure. Nothing is sent anywhere else by default, and there is no telemetry.
- **On-demand downloads.** If the files are not present in the plugin folder, Verbex downloads the PGlite database runtime from `unpkg.com` (the first time the embedding database is opened) and a tokenizer table from `tiktoken.pages.dev` (when it first counts tokens). The offline pack includes both.
- **YouTube.** If you put a YouTube link in a message, the transcript is fetched from `youtube.com`.
- **MCP servers.** If you configure MCP servers, Verbex starts the commands you entered and exchanges data with them.
- **Local embedding (offline pack only).** Starts the bundled Node.js runtime as a child process on your computer. No data leaves the machine.
- **Files outside the vault.** None. Verbex stores its data in the vault: `.verbex/` (Skills, Workflows, checkpoints, run records, indexes) and `.verbex_json_db/` (chat history).
- **Account or payment.** None for Verbex itself. Model providers may require an account and charge for usage.

## Building from source

Windows, Node.js 24.

```powershell
npm.cmd ci
npm.cmd run build   # writes main.js and dist/verbex-agent/
npm.cmd run lint
```

`vendor/` holds the local embedding runtime and model and is large (about 350 MB).

## License and credits

MIT. Verbex began as a fork of [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) (MIT, Heesu Suh) and was redeveloped from there. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
