import type {
  FirmwareImage,
  FirmwareManifest,
  FirmwareManifestImage,
} from '../types'

export const MANIFEST_URL = resolvePublicPath('firmware/manifest.json')

function resolvePublicPath(path: string): string {
  const base = import.meta.env.BASE_URL
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\/+/, '')

  return `${normalizedBase}${normalizedPath}`
}

export function parseFlashAddress(value: string): number {
  const normalized = value.trim()

  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid flash address: ${value}`)
  }

  const address = Number.parseInt(normalized, 16)
  if (!Number.isSafeInteger(address) || address < 0) {
    throw new Error(`Invalid flash address: ${value}`)
  }

  return address
}

export function formatAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase()}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export async function loadFirmwareManifest(): Promise<FirmwareManifest | null> {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Failed to load firmware manifest: ${response.status}`)
  }

  return (await response.json()) as FirmwareManifest
}

export async function loadBuiltInFirmware(
  manifest: FirmwareManifest,
): Promise<FirmwareImage[]> {
  return Promise.all(
    manifest.images.map(async (image, index) => {
      const response = await fetch(resolvePublicPath(image.path))
      if (!response.ok) {
        throw new Error(`Failed to load ${image.name}: ${response.status}`)
      }

      const data = new Uint8Array(await response.arrayBuffer())

      return manifestImageToFirmwareImage(image, data, index)
    }),
  )
}

export async function loadManifestFirmwareImage(
  image: FirmwareManifestImage,
  index: number,
): Promise<FirmwareImage> {
  const response = await fetch(resolvePublicPath(image.path))
  if (!response.ok) {
    throw new Error(`Failed to load ${image.name}: ${response.status}`)
  }

  const data = new Uint8Array(await response.arrayBuffer())

  return manifestImageToFirmwareImage(image, data, index)
}

export async function fileToFirmwareImage(
  file: File,
  addressText: string,
  index: number,
): Promise<FirmwareImage> {
  return {
    id: `upload-${file.name}-${index}-${file.lastModified}`,
    name: file.name,
    address: parseFlashAddress(addressText),
    size: file.size,
    data: new Uint8Array(await file.arrayBuffer()),
    source: 'upload',
  }
}

function manifestImageToFirmwareImage(
  image: FirmwareManifestImage,
  data: Uint8Array,
  index: number,
): FirmwareImage {
  return {
    id: `built-in-${index}-${image.path}`,
    name: image.name,
    address: parseFlashAddress(image.address),
    size: data.byteLength,
    data,
    source: 'built-in',
  }
}
