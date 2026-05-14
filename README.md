# ESP32-S3 Web Flasher

A Vite + React + TypeScript web app for flashing ESP32-S3 firmware from the
browser with Web Serial and `esptool-js`.

## Requirements

- Chrome or Edge with Web Serial support.
- HTTPS hosting, or `localhost` during development.
- ESP32-S3 board connected over USB and in bootloader/download mode.
- Firmware `.bin` files and correct flash offsets.

## Development

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Browser-based serial access works on
`localhost`.

## Built-in Firmware

Built-in firmware entries live in `public/firmware/manifest.json`. Put real
`.bin` files under `public/firmware/` and update the manifest paths and
addresses.

Example ESP-IDF offsets:

- Bootloader: `0x0`
- Partition table: `0x8000`
- Application: `0x10000`

Always confirm offsets from your firmware build output, especially if your
partition table or bootloader configuration is custom.

## Custom Uploads

Use the "自定义上传" section to select one or more `.bin` files. Each file needs a
hex flash address such as `0x10000`.

## Flashing Flow

1. Connect the ESP32-S3 over USB.
2. Put it in bootloader mode if your board does not auto-reset.
3. Click "连接 ESP32-S3" and choose the serial port.
4. Select built-in firmware entries or upload `.bin` files.
5. Check flash parameters and click "开始烧录".

If flashing fails, try a lower baud rate such as `115200` or `460800`.
