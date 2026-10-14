import { jest } from '@jest/globals';

// The braces audit exception (GHSA-vfj7-8cjw-p6xm) relies on listFiles()
// containing a stack overflow raised inside globby's matcher.
const globbyMock = jest.fn() as any;

jest.unstable_mockModule('globby', () => ({
  globby: globbyMock,
}));

const { FileContext } = await import('../src/context/files.js');

describe('FileContext glob failures', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    globbyMock.mockReset();
  });

  it('returns no files when globby rejects with a RangeError', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    globbyMock.mockRejectedValue(new RangeError('Maximum call stack size exceeded'));

    await expect(new FileContext('/unused').listFiles()).resolves.toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to list files:', expect.any(RangeError));
  });
});
