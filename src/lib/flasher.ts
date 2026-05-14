import {
  ESPLoader,
  Transport,
  type FlashOptions,
  type IEspLoaderTerminal,
} from 'esptool-js'
import type { FirmwareImage, FlashProgress, FlashSettings } from '../types'

type FlasherCallbacks = {
  onLog?: (message: string) => void
  onProgress?: (progress: FlashProgress) => void
}

type ConnectResult = {
  chipName: string
}

type WebSerialNavigator = Navigator & {
  serial: {
    requestPort: () => Promise<ConstructorParameters<typeof Transport>[0]>
  }
}

export class Esp32S3Flasher {
  private readonly callbacks: FlasherCallbacks
  private loader?: ESPLoader
  private transport?: Transport

  constructor(callbacks: FlasherCallbacks = {}) {
    this.callbacks = callbacks
  }

  get isConnected(): boolean {
    return Boolean(this.loader && this.transport)
  }

  async connect(baudRate: number): Promise<ConnectResult> {
    if (!('serial' in navigator)) {
      throw new Error('This browser does not support the Web Serial API.')
    }

    const port = await (navigator as WebSerialNavigator).serial.requestPort()
    const transport = new Transport(port, true)
    const terminal = this.createTerminal()
    const loader = new ESPLoader({
      transport,
      baudrate: baudRate,
      terminal,
    })

    this.callbacks.onLog?.('Connecting to ESP32-S3 bootloader...')
    const chipName = await loader.main()

    this.transport = transport
    this.loader = loader
    this.callbacks.onLog?.(`Connected to ${chipName}.`)

    return { chipName }
  }

  async eraseFlash(): Promise<void> {
    const loader = this.requireLoader()
    this.callbacks.onLog?.('Erasing flash...')
    await loader.eraseFlash()
    this.callbacks.onLog?.('Flash erase completed.')
  }

  async writeFlash(
    images: FirmwareImage[],
    settings: FlashSettings,
  ): Promise<void> {
    const loader = this.requireLoader()

    if (images.length === 0) {
      throw new Error('Select at least one firmware image before flashing.')
    }

    const flashOptions: FlashOptions = {
      fileArray: images.map((image) => ({
        data: image.data,
        address: image.address,
      })),
      flashMode: settings.flashMode,
      flashFreq: settings.flashFreq,
      flashSize: settings.flashSize,
      eraseAll: settings.eraseAll,
      compress: settings.compress,
      reportProgress: (fileIndex, written, total) => {
        const image = images[fileIndex]
        this.callbacks.onProgress?.({
          fileIndex,
          fileName: image?.name ?? `Image ${fileIndex + 1}`,
          written,
          total,
          percent: total > 0 ? Math.round((written / total) * 100) : 0,
        })
      },
    }

    this.callbacks.onLog?.(`Writing ${images.length} image(s) to flash...`)
    await loader.writeFlash(flashOptions)
    this.callbacks.onLog?.('Flash write completed.')
  }

  async reset(): Promise<void> {
    const loader = this.requireLoader()
    this.callbacks.onLog?.('Resetting device...')
    await loader.after('hard_reset')
    this.callbacks.onLog?.('Device reset complete.')
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect()
    }

    this.loader = undefined
    this.transport = undefined
  }

  private requireLoader(): ESPLoader {
    if (!this.loader) {
      throw new Error('Connect to a device before starting this action.')
    }

    return this.loader
  }

  private createTerminal(): IEspLoaderTerminal {
    return {
      clean: () => undefined,
      write: (data) => {
        if (data.trim()) {
          this.callbacks.onLog?.(data.trim())
        }
      },
      writeLine: (data) => {
        if (data.trim()) {
          this.callbacks.onLog?.(data.trim())
        }
      },
    }
  }
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}
