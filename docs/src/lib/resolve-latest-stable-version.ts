interface NpmPackageManifest {
    version: string
}

const npmRequestTimeout = 10_000
const stableVersionPattern = /^\d+\.\d+\.\d+$/

/** Uses the successfully published plugin version directly, avoiding stale npm CDN metadata after a release. */
export async function resolveLatestStableVersion(
    packageName: string,
    releaseVersion: string | undefined
): Promise<string> {
    if (releaseVersion === undefined || releaseVersion.length === 0) {
        return fetchLatestStableVersion(packageName)
    }
    if (!stableVersionPattern.test(releaseVersion)) {
        throw new Error(`Expected a stable version for the documentation build, received ${releaseVersion}`)
    }
    return releaseVersion
}

async function fetchLatestStableVersion(packageName: string): Promise<string> {
    const encodedPackageName = encodeURIComponent(packageName)
    const manifestUrl = `https://registry.npmjs.org/${encodedPackageName}/latest`
    const response = await fetch(manifestUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(npmRequestTimeout)
    })

    if (!response.ok) {
        throw new Error(`npm registry returned ${response.status} ${response.statusText} for ${packageName}@latest`)
    }

    const manifest: unknown = await response.json()
    if (!isNpmPackageManifest(manifest)) {
        throw new Error(`npm registry returned an invalid manifest for ${packageName}@latest`)
    }

    const versionWithoutBuildMetadata = manifest.version.split('+', 1)[0]
    if (versionWithoutBuildMetadata.includes('-')) {
        throw new Error(`${packageName}@latest must resolve to a stable version, received ${manifest.version}`)
    }

    return manifest.version
}

function isNpmPackageManifest(value: unknown): value is NpmPackageManifest {
    return (
        typeof value === 'object' &&
        value !== null &&
        'version' in value &&
        typeof value.version === 'string' &&
        value.version.length > 0
    )
}
