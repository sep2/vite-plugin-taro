/** Maps a package version to the npm dist-tag used by the release publisher. */
export function inferNpmTag(version: string): string {
    const buildMetadataStart = version.indexOf('+')
    const versionWithoutBuildMetadata = buildMetadataStart === -1 ? version : version.slice(0, buildMetadataStart)
    const prereleaseStart = versionWithoutBuildMetadata.indexOf('-')
    if (prereleaseStart === -1) return 'latest'

    const [prereleaseIdentifier] = versionWithoutBuildMetadata.slice(prereleaseStart + 1).split('.')
    return /^\d+$/.test(prereleaseIdentifier) ? 'next' : prereleaseIdentifier
}
