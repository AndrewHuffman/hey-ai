function findJsonDocument(output) {
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const character = output[index];
    if (character !== '[' && character !== '{') {
      continue;
    }

    try {
      return JSON.parse(output.slice(index));
    } catch {
      // Lifecycle scripts can write arbitrary text before npm's JSON document.
    }
  }

  throw new Error(`Could not find npm pack metadata in output:\n${output}`);
}

export function parseNpmPackMetadata(output) {
  const metadata = findJsonDocument(output);

  if (Array.isArray(metadata)) {
    if (metadata.length !== 1) {
      throw new Error(`npm pack returned ${metadata.length} package records; expected exactly one`);
    }
    return metadata[0];
  }

  if (metadata && typeof metadata === 'object') {
    const packageRecords = Object.values(metadata);
    if (packageRecords.length !== 1) {
      throw new Error(`npm pack returned ${packageRecords.length} package records; expected exactly one`);
    }
    return packageRecords[0];
  }

  throw new Error('npm pack returned metadata in an unsupported format');
}
