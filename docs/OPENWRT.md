# MV-ST-OEM on OpenWrt (production target)

**OpenWrt / WRT** is the intended production platform for MV-ST-OEM. The Node runtime exposes the programming API on **port 3090**; native C++ daemons on the router link to it via **`sdk/`** on loopback.

## Layout

| Component | Path | Role |
|-----------|------|------|
| MV-ST-OEM runtime | `server.js` + `src/` | Program, tags, drivers, I/O map web UI + `/api` |
| C++ SDK | `sdk/` | OEM daemons: tags, program, runtime control over HTTP |
| OpenWrt package stub | `sdk/openwrt/libpeaklogic-sdk/` | Feed recipe for `libpeaklogic-sdk` |
| HAL plugins (Pi bench) | `hal/plugins/` | SM-I-001 plugin for Pi bring-up; OpenWrt uses Modbus/serial drivers |

## Runtime on the router

Install Node.js on OpenWrt (`CONFIG_PACKAGE_node=y`), copy the MV-ST-OEM tree to `/opt/peaklogic-st-oem`, then:

```bash
cd /opt/peaklogic-st-oem
npm install --production
/etc/init.d/peaklogic-st-oem enable
/etc/init.d/peaklogic-st-oem start
```

Use `deploy/peaklogic-st-oem.service` as a template for `/etc/init.d/peaklogic-st-oem` (adapt paths for OpenWrt procd).

Environment:

| Variable | Value |
|----------|--------|
| `PEAKLOGIC_PRODUCT` | `st-oem` |
| `PEAKLOGIC_DATA` | `/etc/peaklogic` (recommended on router) |
| `PORT` | `3090` |

Web UI: `http://<router-ip>:3090` — API base: `http://127.0.0.1:3090/api`

## C++ SDK — cross-compile (MIPS / musl)

From your OpenWrt build host:

```bash
export STAGING_DIR=/path/to/openwrt/staging_dir/toolchain-mipsel_24kc_gcc-12.3.0_musl

cmake -S sdk -B build-mips \
  -DCMAKE_TOOLCHAIN_FILE=sdk/cmake/toolchain-openwrt.cmake \
  -DCMAKE_PREFIX_PATH=$STAGING_DIR/usr \
  -DPEAKLOGIC_SDK_BUILD_SHARED=OFF

cmake --build build-mips
```

Static linking is recommended on routers. Copy the resulting binary to the device.

### OpenWrt feed package

Copy `sdk/openwrt/libpeaklogic-sdk` into your feed as `package/libpeaklogic-sdk`, then:

```bash
make package/libpeaklogic-sdk/compile V=s
opkg install libpeaklogic-sdk
```

## SDK usage on device

With MV-ST-OEM running locally:

```bash
export MV_HOST=127.0.0.1
export MV_PORT=3090
mv_poll_tags
```

C++ API: `peaklogic::Client` — see `sdk/README.md` for `get_tags()`, `put_program()`, `runtime_start()`, etc.

## Raspberry Pi (development / HAL bench)

Pi 4/5 is supported for SM-I-001 HAL plugin development (`hal/plugins/`, `npm run build-native`). Same API and SDK; default `MV_PORT=3090`.

See distro `README.md` for Pi HAL steps.
