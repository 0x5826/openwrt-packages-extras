# OpenWrt Packages Extras

这是一个集成了 Cloudflared, frp, Netbird, FlowProxy, 和 Lucky 等增强工具的 OpenWrt 软件包仓库（Feed）。本项目侧重于提供最新版本（Next 系列）的客户端及其配套的 LuCI 界面，并支持自动化版本更新。

## 🚀 快速开始

将以下内容添加到您的 OpenWrt `feeds.conf.default` 文件中：

```bash
src-git dante_extras https://git.seckv.com/dante/openwrt-packages-extras.git
```

然后执行：
```bash
./scripts/feeds update dante_extras
./scripts/feeds install -a -p dante_extras
```

---

## 📦 包含的软件包

### 1. Cloudflared Next
包含最新的 `cloudflared` 二进制程序及其对应的 LuCI 控制界面。
- **cloudflared-next**: 增加 `-next` 后缀，可与官方版本共存。
- **luci-app-cloudflared-next**: 提供图形化管理配置。
- **更新脚本**: 在目录下运行 `./update.sh` 可自动从 GitHub 获取最新版本。

### 2. frp Client Next
高性能的反向代理应用，专注于内网穿透。
- **frpc-next**: 专注于 `frpc` 客户端的最新版本适配。
- **luci-app-frpc-next**: 全新的 LuCI 界面，支持高级配置与 Admin API 热重载。
- **稳健性**: `init` 脚本经过优化，具备完善的配置校验、特殊字符转义及容错处理。

### 3. Netbird Next
基于 WireGuard 的零信任网络连接平台。
- **netbird-next**: 包含 `netbird` 客户端。
- **luci-app-netbird-next**: 对应的 LuCI 管理界面。
- **更新脚本**: 支持通过 `./update.sh` 一键同步官方最新版本。

### 4. FlowProxy
基于 `nftables` 的高性能流量分流应用，专为实现精准的旁路由引流/透明代理而设计。
- **最新架构**: 全面适配 `nftables (inet family)`，完美兼容 OpenWrt 23.05+ 执行环境。
- **核心功能**: 实时状态监控、双栈兼容规则引擎、DNS 强制上游。

### 5. Lucky
功能强大的网络工具，支持多种端口管理与动态服务。
- **核心功能**: IPv4/IPv6 端口转发、DDNS (动态域名)、HTTP/HTTPS 反向代理、WOL (网络唤醒)。
- **默认信息**: 管理端口 `16601`，初始账号密码 `666`。

### 6. 其他组件
- **Shadowsocks-rust Next**: 提供高性能的加密代理支持，增加 `-next` 后缀以避免冲突。
- **luci-app-ap-switch**: AP 模式切换辅助工具。
- **luci-app-ssserver-next**: Shadowsocks 服务端管理界面。

---

## 🛠️ 开发与维护

本仓库中的 "Next" 系列软件包均遵循统一的设计模式：
- **update.sh**: 自动检查 GitHub Release，更新 `Makefile` 中的版本号与 Hash。
- **test.sh**: 提供基础的功能或版本验证。
- **Surgical Logic**: `init` 脚本优先考虑配置的安全性和服务的稳定性。

## 🔗 致谢与引用

本项目中的组件基于或参考了以下开源项目，特此鸣谢：

- **Cloudflared**: [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared)
- **frp**: [fatedier/frp](https://github.com/fatedier/frp)
- **Netbird**: [netbirdio/netbird](https://github.com/netbirdio/netbird)
- **FlowProxy**: Apache License 2.0
- **Lucky**: [gdy666/lucky](https://github.com/gdy666/lucky)
