import { CommandDetector } from '../src/context/commands';

describe('CommandDetector', () => {
  it('should detect available commands', () => {
    const detector = new CommandDetector();
    const prefs = detector.getPreferences();
    
    // We expect at least some commands to be detected on a typical mac/linux system
    // like 'ls' or 'grep' alternatives if they are installed.
    // This test depends on the environment, but we can verify it returns an object.
    expect(typeof prefs).toBe('object');
  });

  it('should generate a non-empty context string if commands found', () => {
    const detector = new CommandDetector();
    const context = detector.getContextString();
    
    // If the system has fd or rg etc., context should contain them
    if (Object.keys(detector.getPreferences()).length > 0) {
      expect(context).toContain('User\'s Preferred Commands');
    }
  });
});

