# hey-ai

`hey-ai` is an enhanced command-line interface for LLM interactions, designed specifically for terminal productivity. It automatically gathers context from your current environment—including file structure, command history, and session history—to provide more accurate and executable terminal commands.

## Demo

![Demo](./tools/demos/demo.gif)

## Quick Start

```bash
# Install hey-ai
npm install -g hey-ai

# Set up your API key (at least one is required)
export ANTHROPIC_API_KEY=your-key   # For Claude (Recommended)
export OPENAI_API_KEY=your-key      # For GPT
export GEMINI_API_KEY=your-key      # For Gemini

# Start asking questions!
hey-ai "how do I find all large files in this directory?"
```

## Key Features

- **🧠 Automatic Context Gathering**:
  - **ZSH History**: Includes the last 15 commands to understand what you're currently doing.
  - **File Context**: Scans the current directory (respecting `.gitignore`) and includes the content of files mentioned in your query.
  - **Session History**: Persistent SQLite-backed history of previous AI interactions for conversational continuity.
  - **Modern Command Detection**: Detects modern CLI tools you have installed (like `fd`, `rg`, `bat`, `eza`, `delta`) and prefers them over legacy commands.

- **🔌 Active MCP (Model Context Protocol) Support**: 
  - **Agentic Tool Use**: The AI doesn't just see tools; it can **actively call them** to read files, search the web, or modify your system (if permitted).
  - **Visual Feedback**: Real-time indicators show when the AI is using a tool:
    ```
    🔧 [MCP: read_text_file via filesystem]
       ✓ completed in 4ms
    ```
  - **Universal Integration**: Support for any MCP server (filesystem, brave-search, fetch, etc.).

- **📋 Clipboard Integration**: Automatically extracts the suggested command from the AI's response and copies it to your clipboard.
- **🚀 Multi-Provider SDK**: Built on the Vercel AI SDK. native support for Anthropic, OpenAI, and Google Gemini without external wrappers.

## Prerequisites

- **Node.js** 18+ 
- **API Key**: One of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`.
- **zsh**: Currently optimized for zsh history parsing

## Installation

```bash
# Install globally from npm
npm install -g hey-ai

# Or with pnpm
pnpm add -g hey-ai
```

### From Source

```bash
git clone https://github.com/andrewhuffman/hey-ai.git
cd hey-ai
pnpm install
pnpm run build
pnpm link --global
```

## Usage

Ask a question directly:
```bash
hey-ai "how do I find all large files in the current directory?"
```

Enter **interactive mode** by omitting the query:
```bash
hey-ai
```

The tool will:
1. Gather context (files, history, preferred commands).
2. Connect to configured MCP servers.
3. Call the LLM (which may call MCP tools recursively).
4. Stream the response and **copy the suggest command to your clipboard**.

### Options

```bash
hey-ai [query] [options]

Options:
  -m, --model <model>  Specify the model to use (claude, gpt, gemini)
  --no-history         Do not include history context
  --no-files           Do not include file context
  --system <prompt>    System prompt override
  --no-context         Skip context gathering (fast mode)
  -v, --verbose        Show debug output
  --show-context       Show assembled context without calling LLM
  --show-prefs         Show detected command preferences
  -V, --version        output the version number
  -h, --help           display help for command
```

### Using Different Models

`hey-ai` supports various providers and friendly aliases:

```bash
# Use Claude (Default recommended)
hey-ai -m haiku "explain this error"
hey-ai -m sonnet "optimize this code"

# Use OpenAI
hey-ai -m gpt-4o "what does this script do?"
hey-ai -m gpt-4 "summarize this"

# Use Google Gemini
hey-ai -m gemini "help me with this git command"
```

**Common Aliases:**
- `haiku` → `claude-3-5-haiku-20241022`
- `sonnet` → `claude-3-5-sonnet-20241022`
- `opus` → `claude-3-opus-20240229`
- `gemini` → `gemini-1.5-flash`
- `gpt4` → `gpt-4o`


### Shell Completions

Generate zsh completions:
```bash
hey-ai completion > ~/.zsh/completion/_hey-ai
```
Then add the following to your `~/.zshrc`:
```bash
fpath=(~/.zsh/completion $fpath)
autoload -Uz compinit
compinit
```

## Configuration

### MCP Servers

MCP servers are stored in `~/.config/hey-ai/config.json` and can be managed via CLI commands.

**List available presets:**
```bash
hey-ai mcp presets
```

**Add preset servers:**
```bash
# Add deepwiki (remote SSE server for GitHub repo documentation)
hey-ai mcp add-preset deepwiki

# Add filesystem access with custom root path
hey-ai mcp add-preset filesystem --path /path/to/dir

# Add brave search with API key
hey-ai mcp add-preset brave-search -e BRAVE_API_KEY=your-key

# Add web fetcher
hey-ai mcp add-preset fetch
```

**Add custom servers:**
```bash
# Add a local stdio server
hey-ai mcp add my-server node /path/to/server.js

# Add with environment variables (use -- to separate)
hey-ai mcp add my-server -e API_KEY=secret -- npx -y my-mcp-server

# Add a remote HTTP/SSE server
hey-ai mcp add -t http stripe https://mcp.stripe.com
hey-ai mcp add -t sse asana https://mcp.asana.com/sse

# Add from JSON config
hey-ai mcp add-json myserver '{"command":"node","args":["server.js"]}'
```

**Manage servers:**
```bash
hey-ai mcp list              # List all configured servers
hey-ai mcp get <name>        # Show details for a server
hey-ai mcp remove <name>     # Remove a server
```

### Command Preferences

To see which modern command alternatives were detected on your system:

```bash
hey-ai --show-prefs
```

### Default Model

You can set a default model and your API keys in two ways:

1. **Environment Variables** (Recommended):
   ```bash
   export ANTHROPIC_API_KEY=your-key
   export LLM_MODEL=haiku
   ```
2. **CLI Config**: Use the built-in config command to set the default model.
   ```bash
   hey-ai config set defaultModel haiku
   ```

## License

ISC
