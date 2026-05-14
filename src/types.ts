import type {
  FlashFreqValues,
  FlashModeValues,
  FlashSizeValues,
} from 'esptool-js'

export type FirmwareImage = {
  id: string
  name: string
  address: number
  size: number
  data: Uint8Array
  source: 'built-in' | 'upload'
}

export type FirmwareManifestImage = {
  name: string
  path: string
  address: string
}

export type FirmwareManifest = {
  name: string
  version?: string
  description?: string
  images: FirmwareManifestImage[]
}

export type FlashSettings = {
  baudRate: number
  flashMode: FlashModeValues
  flashFreq: FlashFreqValues
  flashSize: FlashSizeValues
  eraseAll: boolean
  compress: boolean
}

export type FlashProgress = {
  fileIndex: number
  fileName: string
  written: number
  total: number
  percent: number
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export type LogEntry = {
  id: number
  level: LogLevel
  message: string
  time: string
}
