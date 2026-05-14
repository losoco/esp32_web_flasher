import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Esp32S3Flasher, isWebSerialSupported } from './lib/flasher'
import {
  fileToFirmwareImage,
  formatBytes,
  loadFirmwareManifest,
  loadManifestFirmwareImage,
  parseFlashAddress,
} from './lib/firmware'
import type {
  FirmwareImage,
  FirmwareManifest,
  FirmwareManifestImage,
  FlashProgress,
  FlashSettings,
  LogEntry,
  LogLevel,
} from './types'

type UploadRow = {
  id: string
  file: File
  address: string
}

const DEFAULT_SETTINGS: FlashSettings = {
  baudRate: 921600,
  flashMode: 'dio',
  flashFreq: '80m',
  flashSize: '16MB',
  eraseAll: false,
  compress: true,
}

const baudRates = [115200, 230400, 460800, 921600, 1500000]
const flashModes: FlashSettings['flashMode'][] = ['dio', 'qio', 'dout', 'qout']
const flashFreqs: FlashSettings['flashFreq'][] = [
  '80m',
  '60m',
  '48m',
  '40m',
  '30m',
  '26m',
  '24m',
  '20m',
]
const flashSizes: FlashSettings['flashSize'][] = [
  'detect',
  '4MB',
  '8MB',
  '16MB',
  '32MB',
]

function getFileNameFromPath(path: string): string {
  return path.split('/').pop()?.toLowerCase() ?? path.toLowerCase()
}

function getDefaultUploadAddress(
  file: File,
  index: number,
  manifestImages: FirmwareManifestImage[],
): string {
  const fileName = file.name.toLowerCase()
  const matchedImage = manifestImages.find((image) => {
    return (
      getFileNameFromPath(image.path) === fileName ||
      image.name.toLowerCase() === fileName
    )
  })

  if (matchedImage) {
    return matchedImage.address
  }

  return manifestImages[index]?.address ?? '0x10000'
}

function App() {
  const [manifest, setManifest] = useState<FirmwareManifest | null>(null)
  const [manifestError, setManifestError] = useState('')
  const [selectedBuiltInPaths, setSelectedBuiltInPaths] = useState<string[]>([])
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [settings, setSettings] = useState<FlashSettings>(DEFAULT_SETTINGS)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState<FlashProgress | null>(null)
  const [chipName, setChipName] = useState('')
  const [status, setStatus] = useState('Idle')
  const [busy, setBusy] = useState(false)
  const flasherRef = useRef<Esp32S3Flasher | null>(null)

  const serialSupported = isWebSerialSupported()

  const addLog = useCallback((level: LogLevel, message: string) => {
    setLogs((current) => [
      {
        id: Date.now() + Math.random(),
        level,
        message,
        time: new Date().toLocaleTimeString(),
      },
      ...current,
    ])
  }, [])

  useEffect(() => {
    let mounted = true

    loadFirmwareManifest()
      .then((loadedManifest) => {
        if (mounted) {
          setManifest(loadedManifest)
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setManifestError(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const selectedBuiltInImages = useMemo(() => {
    return (
      manifest?.images.filter((image) =>
        selectedBuiltInPaths.includes(image.path),
      ) ?? []
    )
  }, [manifest, selectedBuiltInPaths])

  const selectedCount = selectedBuiltInImages.length + uploads.length
  const canFlash = serialSupported && selectedCount > 0 && Boolean(chipName) && !busy

  function toggleBuiltInImage(image: FirmwareManifestImage): void {
    setSelectedBuiltInPaths((current) =>
      current.includes(image.path)
        ? current.filter((path) => path !== image.path)
        : [...current, image.path],
    )
  }

  function addUploadRows(files: FileList | null): void {
    if (!files?.length) {
      return
    }

    setSelectedBuiltInPaths([])
    const manifestImages = manifest?.images ?? []
    setUploads((current) => [
      ...current,
      ...Array.from(files).map((file, index) => ({
        id: `upload-${file.name}-${file.lastModified}-${index}-${Date.now()}`,
        file,
        address: getDefaultUploadAddress(file, index, manifestImages),
      })),
    ])
  }

  function updateUploadAddress(id: string, address: string): void {
    setUploads((current) =>
      current.map((row) => (row.id === id ? { ...row, address } : row)),
    )
  }

  function removeUpload(id: string): void {
    setUploads((current) => current.filter((row) => row.id !== id))
  }

  async function runAction(
    nextStatus: string,
    action: (flasher: Esp32S3Flasher) => Promise<void>,
    successStatus = 'Ready',
  ): Promise<void> {
    const flasher = flasherRef.current
    if (!flasher) {
      addLog('warning', '请先连接 ESP32-S3。')
      return
    }

    setBusy(true)
    setStatus(nextStatus)

    try {
      await action(flasher)
      setStatus(successStatus)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addLog('error', message)
      setStatus('Error')
    } finally {
      setBusy(false)
    }
  }

  async function connectDevice(): Promise<void> {
    setBusy(true)
    setStatus('Connecting')
    setProgress(null)

    const flasher = new Esp32S3Flasher({
      onLog: (message) => addLog('info', message),
      onProgress: setProgress,
    })

    try {
      const result = await flasher.connect(settings.baudRate)
      flasherRef.current = flasher
      setChipName(result.chipName)
      setStatus('Ready')
      addLog('success', `已连接：${result.chipName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addLog('error', message)
      setStatus('Error')
    } finally {
      setBusy(false)
    }
  }

  async function disconnectDevice(): Promise<void> {
    await runAction(
      'Disconnecting',
      async (flasher) => {
        await flasher.disconnect()
        flasherRef.current = null
        setChipName('')
        setProgress(null)
        addLog('success', '设备已断开。')
      },
      'Idle',
    )
  }

  async function buildFirmwareImages(): Promise<FirmwareImage[]> {
    selectedBuiltInImages.forEach((image) => parseFlashAddress(image.address))
    uploads.forEach((row) => parseFlashAddress(row.address))

    const builtInImages = await Promise.all(
      selectedBuiltInImages.map((image) =>
        loadManifestFirmwareImage(image, manifest?.images.indexOf(image) ?? 0),
      ),
    )
    const uploadedImages = await Promise.all(
      uploads.map((row, index) => fileToFirmwareImage(row.file, row.address, index)),
    )

    return [...builtInImages, ...uploadedImages]
  }

  async function eraseFlash(): Promise<void> {
    await runAction('Erasing', (flasher) => flasher.eraseFlash())
    addLog('success', '整片擦除完成。')
  }

  async function flashDevice(): Promise<void> {
    await runAction('Flashing', async (flasher) => {
      setProgress(null)
      const images = await buildFirmwareImages()
      await flasher.writeFlash(images, settings)
      await flasher.reset()
      addLog('success', '烧录完成，设备已复位。')
    })
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ESP32-S3 Online Flasher</p>
          <h1>ESP32-S3 在线烧录</h1>
          <p className="subtitle">
            使用浏览器 Web Serial API 连接开发板，支持内置固件和自定义
            .bin 文件烧录。
          </p>
        </div>
        <div className={`status-card status-${status.toLowerCase()}`}>
          <span>状态</span>
          <strong>{status}</strong>
          <small>{chipName || '未连接设备'}</small>
        </div>
      </header>

      {!serialSupported && (
        <section className="alert">
          当前浏览器不支持 Web Serial。请使用 Chrome 或 Edge，并通过 HTTPS
          或 localhost 打开本页面。
        </section>
      )}

      <section className="panel controls-panel">
        <div>
          <h2>1. 连接设备</h2>
          <p>按住 BOOT 或让开发板自动进入下载模式，然后选择串口。</p>
        </div>
        <div className="button-row">
          <button type="button" onClick={connectDevice} disabled={!serialSupported || busy}>
            连接 ESP32-S3
          </button>
          <button type="button" className="secondary" onClick={disconnectDevice} disabled={!chipName || busy}>
            断开
          </button>
        </div>
      </section>

      <div className="grid">
        <section className="panel">
          <h2>2. 选择固件</h2>
          <div className="firmware-block">
            <h3>内置固件</h3>
            {manifestError && <p className="error-text">{manifestError}</p>}
            {!manifest && !manifestError && <p>正在读取固件清单...</p>}
            {manifest && (
              <>
                <p className="muted">
                  {manifest.name}
                  {manifest.version ? ` · ${manifest.version}` : ''}
                </p>
                {manifest.description && <p>{manifest.description}</p>}
                {manifest.images.length === 0 ? (
                  <p className="muted">清单中还没有固件条目。</p>
                ) : (
                  <div className="firmware-list">
                    {manifest.images.map((image) => (
                      <label key={image.path} className="firmware-item">
                        <input
                          type="checkbox"
                          checked={selectedBuiltInPaths.includes(image.path)}
                          onChange={() => toggleBuiltInImage(image)}
                        />
                        <span>
                          <strong>{image.name}</strong>
                          <small>
                            {image.path} · {image.address}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="firmware-block">
            <h3>自定义上传</h3>
            <input
              type="file"
              accept=".bin,application/octet-stream"
              multiple
              onChange={(event) => addUploadRows(event.currentTarget.files)}
            />
            {uploads.length > 0 && (
              <div className="upload-list">
                {uploads.map((row) => (
                  <div key={row.id} className="upload-row">
                    <div>
                      <strong>{row.file.name}</strong>
                      <small>{formatBytes(row.file.size)}</small>
                    </div>
                    <label>
                      地址
                      <input
                        value={row.address}
                        onChange={(event) =>
                          updateUploadAddress(row.id, event.currentTarget.value)
                        }
                        placeholder="0x10000"
                      />
                    </label>
                    <button type="button" className="ghost" onClick={() => removeUpload(row.id)}>
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>3. 烧录参数</h2>
          <div className="settings-grid">
            <label>
              波特率
              <select
                value={settings.baudRate}
                onChange={(event) => {
                  const baudRate = Number(event.currentTarget.value)
                  setSettings((current) => ({
                    ...current,
                    baudRate,
                  }))
                }}
              >
                {baudRates.map((baudRate) => (
                  <option key={baudRate} value={baudRate}>
                    {baudRate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Flash Mode
              <select
                value={settings.flashMode}
                onChange={(event) => {
                  const flashMode = event.currentTarget
                    .value as FlashSettings['flashMode']
                  setSettings((current) => ({
                    ...current,
                    flashMode,
                  }))
                }}
              >
                {flashModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Flash Freq
              <select
                value={settings.flashFreq}
                onChange={(event) => {
                  const flashFreq = event.currentTarget
                    .value as FlashSettings['flashFreq']
                  setSettings((current) => ({
                    ...current,
                    flashFreq,
                  }))
                }}
              >
                {flashFreqs.map((freq) => (
                  <option key={freq} value={freq}>
                    {freq}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Flash Size
              <select
                value={settings.flashSize}
                onChange={(event) => {
                  const flashSize = event.currentTarget
                    .value as FlashSettings['flashSize']
                  setSettings((current) => ({
                    ...current,
                    flashSize,
                  }))
                }}
              >
                {flashSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.eraseAll}
              onChange={(event) => {
                const eraseAll = event.currentTarget.checked
                setSettings((current) => ({
                  ...current,
                  eraseAll,
                }))
              }}
            />
            烧录前擦除整片 Flash
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.compress}
              onChange={(event) => {
                const compress = event.currentTarget.checked
                setSettings((current) => ({
                  ...current,
                  compress,
                }))
              }}
            />
            传输时压缩固件
          </label>

          <div className="summary">
            <strong>待烧录镜像：{selectedCount}</strong>
            {selectedBuiltInImages.map((image) => (
              <span key={image.path}>
                {image.name} @ {image.address}
              </span>
            ))}
            {uploads.map((row) => (
              <span key={row.id}>
                {row.file.name} @ {row.address}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="panel action-panel">
        <div>
          <h2>4. 执行烧录</h2>
          <p>烧录过程中不要拔掉 USB 线。失败时可降低波特率后重试。</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary" onClick={eraseFlash} disabled={!chipName || busy}>
            仅擦除
          </button>
          <button type="button" onClick={flashDevice} disabled={!canFlash}>
            开始烧录
          </button>
        </div>
        {progress && (
          <div className="progress-block">
            <div>
              <strong>{progress.fileName}</strong>
              <span>
                {formatBytes(progress.written)} / {formatBytes(progress.total)} ·{' '}
                {progress.percent}%
              </span>
            </div>
            <progress value={progress.percent} max="100" />
          </div>
        )}
      </section>

      <section className="panel logs-panel">
        <div className="logs-header">
          <h2>日志</h2>
          <button type="button" className="ghost" onClick={() => setLogs([])}>
            清空
          </button>
        </div>
        <div className="logs">
          {logs.length === 0 ? (
            <p className="muted">暂无日志。</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`log-line log-${log.level}`}>
                <time>{log.time}</time>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

export default App
