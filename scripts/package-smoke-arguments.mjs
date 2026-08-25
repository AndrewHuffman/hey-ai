export function getRetainedTarballArgument(arguments_) {
  const positionalArguments = arguments_.filter((argument) => argument !== '--');

  if (positionalArguments.length > 1) {
    throw new Error(
      `Expected at most one retained tarball path, received: ${positionalArguments.join(', ')}`,
    );
  }

  return positionalArguments[0];
}
