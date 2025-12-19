# hey-ai

`hey-ai` is an enhanced command-line interface for LLM interactions, designed specifically for terminal productivity. It automatically gathers context from your current environment—including file structure, command history, and session history—to provide more accurate and executable terminal commands.

## Key Features

- **🧠 Automatic Context Gathering**:
  - **ZSH History**: Includes the last 15 commands to understand what you're currently doing.
  - **File Context**: Scans the current directory (respecting `.gitignore`) and includes the content of files mentioned in your query.
  - **Session History**: Persistent SQLite-backed history of previous AI interactions for conversational continuity.
  - **Modern Command Detection**: Detects modern CLI tools you have installed (like `fd`, `rg`, `bat`, `eza`, `delta`) and instructs the AI to prefer them over legacy commands.

- **🔌 MCP (Model Context Protocol) Support**: Connects to MCP servers to expand the LLM's capabilities.
  - **Tools**: Automatically includes available MCP tools in the context so the AI knows what's possible.
  - **Resources**: Fetches and includes relevant MCP resources in the prompt context.
- **📋 Clipboard Integration**: Automatically extracts the last executable command block from the AI's response and copies it to your clipboard.
- **🚀 Fast & Flexible**: Built on top of the excellent [`llm`](https://llm.datasette.io/) CLI. Supports streaming and easy model switching.

## Prerequisites

- [**llm**](https://llm.datasette.io/en/stable/setup.html): This tool acts as a wrapper around the `llm` CLI.
- **zsh**: Currently optimized for zsh history parsing.

## Installation

```bash
# Clone the repository
git clone https://github.com/andrewhuffman/hey-ai.git
cd hey-ai

# Install dependencies and link globally
npm install
npm run build
npm link
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
2. Call the LLM with the context and your query.
3. Stream the response to the terminal.
4. **Copy the suggested command to your clipboard** automatically.

### Options

```bash
hey-ai [query] [options]

Options:
  -m, --model <model>  Specify the model to use (passed to llm)
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

You can set a default model in three ways:

1. **Environment Variable**: Set `LLM_MODEL` in your shell.
   ```bash
   export LLM_MODEL=gpt-4o
   ```
2. **CLI Config**: Use the built-in config command.
   ```bash
   hey-ai config set defaultModel gpt-4o
   ```
3. **LLM Tool Default**: `hey-ai` will respect the default model set in the underlying `llm` tool.
   ```bash
   llm models default gpt-4o
   ```

## License

ISC

