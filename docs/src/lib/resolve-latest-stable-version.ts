interface NpmPackageManifest {
    version: string
}

const npmRequestTimeout = 10_000
const stableReleaseTagPattern = /^v\d+\.\d+\.\d+$/

/** Resolves the stable release from its successful publish or npm's authoritative latest dist-tag. */
export async function resolveLatestStableVersion(packageName: string, releaseTag: string | undefined): Promise<string> {
    if (releaseTag === undefined || releaseTag.length === 0) {
        return fetchLatestStableVersion(packageName)
    }
    if (!stableReleaseTagPattern.test(releaseTag)) {
        throw new Error(`Expected a stable release tag for the documentation build, received ${releaseTag}`)
    }
    return releaseTag.slice(1)
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
