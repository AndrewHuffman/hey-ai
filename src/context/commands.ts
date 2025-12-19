import { spawnSync } from 'node:child_process';

// Common command alternatives - maps "generic" to possible better alternatives
const COMMAND_ALTERNATIVES: Record<string, string[]> = {
  find: ['fd', 'fdfind'],
  grep: ['rg', 'ripgrep', 'ag'],
  cat: ['bat', 'batcat'],
  ls: ['eza', 'exa', 'lsd'],
  diff: ['delta', 'difft'],
  sed: ['sd'],
  du: ['dust', 'ncdu'],
  top: ['htop', 'btop', 'gtop'],
  curl: ['httpie', 'http', 'xh'],
  man: ['tldr'],
  cd: ['z', 'zoxide', 'autojump', 'j'],
  ps: ['procs'],
};

export class CommandDetector {
  private availableCommands: Set<string> = new Set();
  private preferredCommands: Map<string, string> = new Map();

  constructor() {
    this.detectCommands();
  }

  private detectCommands() {
    // Check which alternative commands are available
    for (const [generic, alternatives] of Object.entries(COMMAND_ALTERNATIVES)) {
      for (const alt of alternatives) {
        if (this.isCommandAvailable(alt)) {
          this.availableCommands.add(alt);
          // First available alternative becomes the preferred one
          if (!this.preferredCommands.has(generic)) {
            this.preferredCommands.set(generic, alt);
          }
        }
      }
    }
  }

  private isCommandAvailable(cmd: string): boolean {
    try {
      const result = spawnSync('which', [cmd], { encoding: 'utf8' });
      return result.status === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  getAvailableAlternatives(): string[] {
    return Array.from(this.availableCommands);
  }

  getPreferences(): Record<string, string> {
    return Object.fromEntries(this.preferredCommands);
  }

  getContextString(): string {
    const prefs = this.getPreferences();
    if (Object.keys(prefs).length === 0) {
      return '';
    }

    const lines = ['## User\'s Preferred Commands'];
    lines.push('The user has these modern alternatives installed. Prefer these over standard commands:');
    for (const [generic, preferred] of Object.entries(prefs)) {
      lines.push(`- Use \`${preferred}\` instead of \`${generic}\``);
    }
    return lines.join('\n');
  }
}

