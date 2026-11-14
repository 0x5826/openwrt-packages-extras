# OpenWrt Packages Extras (主分支: OpenWrt 23.05+ / 24.x / 25.x)

专为现代 OpenWrt / ImmortalWrt 固件打造的软件包扩展源（Feed），提供最新版本的网络代理、Mesh 组网、内网穿透、运维工具及配套 LuCI 管理界面。

---

## 适用范围

- **适用固件**: OpenWrt 23.05 / 24.10 / 25.x、ImmortalWrt 23.05+ 及更新分支（Linux 5.15 / 6.x+ 内核）。
- **系统架构**: 防火墙基于 `fw4` (`nftables`)，RPCD 后端基于 `ucode` (`rpcd-mod-ucode`)，前端采用 LuCI2 客户端 JavaScript 视图。
- **旧版分支**: 若需用于 OpenWrt 21.02（Linux 5.4 / `fw3` iptables / Lua 5.1 RPCD），请切换至 `openwrt-21.02` 分支。

---

## 支持软件包清单

### 1. 后端核心程序包

| 软件包名称 | 版本 | 上游项目 | 功能说明 |
| :--- | :--- | :--- | :--- |
| `cloudflared-next` | `2026.11.0` | `cloudflare/cloudflared` | Cloudflare Tunnel 官方预编译客户端 |
| `easytier-next` | `2.6.4` | `EasyTier/EasyTier` | 去中心化 Mesh VPN 客户端（支持 WireGuard 与 Web 控制台） |
| `frpc-next` | `0.72.0` | `fatedier/frp` | 高性能反向代理内网穿透客户端 |
| `lucky` | `3.5.0` | `gdy666/lucky` | 集成端口转发、DDNS、反向代理、WOL 等功能的综合网络工具 |
| `shadowsocks-rust-next` | `1.25.0` | `shadowsocks/shadowsocks-rust` | Rust 版 Shadowsocks 代理套件（提供 `ssserver` 与 `sslocal`） |
| `tailscale-next` | `1.104.7` | `tailscale/tailscale` | 基于 WireGuard 的零配置虚拟组网守护进程与客户端 |
| `linkback` | `1.0.0` | 自研 C 守护进程 | 多 WAN 链路健康探测（Ping/DNS/TCP）与动态路由跃点故障切换守护进程 |

### 2. LuCI 管理界面插件

| 软件包名称 | 对应后端 / 依赖 | 功能说明 |
| :--- | :--- | :--- |
| `luci-app-cloudflared-next` | `cloudflared-next` | Cloudflare Tunnel Token 图形化配置、状态监控与日志查看 |
| `luci-app-easytier-next` | `easytier-next` | EasyTier 运行状态、SVG 全景拓扑图、直连子网探测与防火墙放行 |
| `luci-app-frpc-next` | `frpc-next` | frpc 客户端多规则配置、Admin API 热重载与连接状态监控 |
| `luci-app-lucky` | `lucky` | Lucky 后台服务启停控制与 Web 管理端口快速直达 |
| `luci-app-ssserver-next` | `shadowsocks-rust-ssserver-next` | Shadowsocks-rust 服务端图形化配置与进程守护 |
| `luci-app-tailscale-next` | `tailscale-next` | Tailscale 登录认证、节点状态、子网通告与防火墙/hotplug 路由自愈 |
| `luci-app-linkback` | `linkback` | Multi-WAN 链路故障转移与自动回切策略图形化配置 |
| `luci-app-flowproxy` | `nftables` + `ip-full` | 基于 `nftables` 的旁路由透明分流、DNS 转发与看门狗热降级自愈 |
| `luci-app-cf-optimizer` | `curl` + `jq` | Cloudflare 优选 IP 测速与隧道主机优选优化工具 |
| `luci-app-ap-switch` | LuCI 原生组件 | 一键在路由器模式与瘦 AP（无线接入点）模式间切换 |
| `luci-app-fancontrol` | 硬件 PWM 接口 | 针对 BPI-R4 等设备的 PWM 风扇温控曲线管理 |
| `luci-app-modem-manager-next` | `ModemManager` | 蜂窝移动网络调制解调器状态监控与管理界面 |

---

## 仓库使用方法

在 OpenWrt 源码根目录下编辑 `feeds.conf.default`，添加本仓库作为 Feed 源：

```bash
# 添加主分支 Feed 源 (OpenWrt 23.05+ / 24.x / 25.x)
src-git dante_extras https://git.seckv.com/dante/openwrt-packages-extras.git
```

更新并安装全部软件包至构建树：

```bash
./scripts/feeds update dante_extras
./scripts/feeds install -a -p dante_extras
```

运行配置菜单选择所需软件包后编译：

```bash
make menuconfig
```

- **LuCI 界面**: `LuCI -> 3. Applications -> luci-app-*`
- **后端程序**: `Network -> VPN / Web Servers/Proxies / Routing and Redirection`

---

## 常规维护

后端二进制包的版本检查与更新流程见 [MAINTENANCE.md](./MAINTENANCE.md)。
