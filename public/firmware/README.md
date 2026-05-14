# Built-in Firmware

Place ESP32-S3 firmware binaries in this directory and describe them in
`manifest.json`. The current manifest is wired to the Edge Agent build copied
from `esp-claw_ref/application/edge_agent/build`.

Current images and offsets:

- `edge_agent/bootloader.bin` at `0x0`
- `edge_agent/partition-table.bin` at `0x8000`
- `edge_agent/ota_data_initial.bin` at `0xF000`
- `edge_agent/edge_agent.bin` at `0x20000`
- `edge_agent/storage.bin` at `0xB20000`

Current flash settings from `flasher_args.json`:

- Flash mode: `dio`
- Flash frequency: `80m`
- Flash size: `16MB`

Adjust the paths and addresses to match the output from your firmware build.
For ESP-IDF projects, confirm the offsets with `flasher_args.json` or the build
log.
