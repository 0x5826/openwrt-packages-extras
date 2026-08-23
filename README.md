# OpenWrt Packages Extras (OpenWrt 21.02 专属兼容分支)

本项目是专为 OpenWrt 21.02 / ImmortalWrt 21.02 及同代旧版固件环境定制的高性能软件包扩展源（Feed）。本分支针对旧版平台的内核特性、`fw3` 防火墙机制与 Lua RPCD 架构进行了全面重构与纯净化适配，零 `ucode` 依赖，确保在经典系统与低内存设备上 100% 稳定运行。

---

## 适用系统架构与发行版本

- **适用发行版**: OpenWrt 21.02 / 21.02-SNAPSHOT、ImmortalWrt 21.02 及基于 Linux 5.4 内核派生的同代固件系统。
- **底层技术特征**:
  - **Linux 内核**: 5.4 LTS。
  - **防火墙架构**: 基于 `fw3` (iptables / ipset 体系与 `/etc/init.d/firewall reload`)。
  - **RPCD 后端**: 全组件**去 ucode 纯净化**，采用标准 `rpcd-mod-file` 配合原生 Lua 5.1 脚本 (`/usr/libexec/rpcd/*`) 与 Shell 实现，修复了空 table 序列化导致的签名丢失问题。
  - **前端视图**: 客户端 JavaScript (LuCI2 视图架构)，向下兼容旧版浏览器与精简版 LuCI 运行时。
- **现代版本指引**: 若您使用的是 OpenWrt 23.05+ / 24.x / 25.x 等新版系统（`fw4` / nftables / 原生 ucode 架构），请切换至本项目的 **`main`** 主分支。

---

## 前后端架构与 RPC 服务特征

### 1. 前端架构特征
- **纯客户端单页渲染**: 采用 LuCI2 现代 JavaScript API (`form.Map`, `form.DynamicList`, `form.NamedSection`)；
- **全景拓扑动态可视化**: 内置轻量级 SVG 矢量拓扑图渲染引擎，支持多节点分层布局、链路延迟智能仲裁与代理网段独立排版；
- **组件规范化交互**: 状态指示与服务控制紧凑内嵌，去除多余冗余卡片，与 OpenWrt 官方设计规范保持统一；
- **安全语法兼容**: 前端代码经过深度兼容处理（消除可选链等现代语法阻断），保证在旧版嵌入式 Web 视图下稳定加载。

### 2. 后端服务与 RPC 方法定义
本分支后端服务全面采用原生 Lua 5.1 脚本（位于 `/usr/libexec/rpcd/`），基于 `luci.jsonc` 与 `nixio` 原生库开发，严格遵守 `rpcd-mod-file` 签名协议。主要包含以下通用 RPC 方法：

| RPC 方法名称 | 说明 | 21.02 分支原生 Lua 实现机制 |
| :--- | :--- | :--- |
| `get_status` | 核心服务与后台状态查询 | 结合 `ubus service list` 及守护进程 PID 自省，精准区分托管运行、非托管运行与停止状态 |
| `get_peers` | 对等连接节点明细查询 | 优先使用底层客户端 `-o json` 模式，降级使用表格正则解析，并自动关联合并代理子网 (proxy_cidrs) |
| `get_topology` | Mesh 拓扑全景图数据提取 | 自动过滤重启残留的幽灵脏数据节点，精准仲裁双向链路延迟 |
| `get_subroutes` | 直连物理子网多层自愈探测 | 三层自愈逻辑：`ip -j route` -> 文本格式 `ip route` 正则提取 -> `ubus network.interface dump` |
| `get_logs` | 运行日志读取 | 优先读取系统 `logread -e`，降级读取临时日志文件 |
| `clear_logs` | 运行日志安全清空 | 原子清空临时日志缓冲区 |
| `service_action` | 服务生命周期安全管理 | 严格执行平滑重启、停止与僵尸进程强杀收敛接管 |

---

## 编译引入 Feed 源操作指引

在您的 OpenWrt 21.02 源码根目录下，编辑 `feeds.conf.default` 文件，添加本仓库的 `openwrt-21.02` 分支源：

```bash
# 添加 openwrt-21.02 专属分支 Feed 源
src-git dante_extras https://git.seckv.com/dante/openwrt-packages-extras.git;openwrt-21.02
```

执行以下命令完成 Feed 源更新与软件包安装：

```bash
# 1. 更新 Feed 索引
./scripts/feeds update dante_extras

# 2. 安装本仓库的所有软件包至构建树
./scripts/feeds install -a -p dante_extras
```

运行配置菜单选择所需插件：

```bash
make menuconfig
```

在配置菜单中定位软件包：
- **LuCI 界面**: `LuCI -> 3. Applications -> luci-app-*`
- **网络核心包**: `Network -> VPN -> easytier-next / tailscale-next` 等

---

## 包含的软件包清单与功能说明

### 1. EasyTier Next 全功能套件
去中心化 Mesh VPN 组网客户端及管理系统。
- **easytier-next**: 适配 Linux 5.4 内核与 OpenWrt 21.02 工具链的 EasyTier 核心及命令行程序。
- **luci-app-easytier-next**:
  - 核心运行状态与 Web 控制台一键联动；
  - 动态 SVG 全景网络拓扑图，支持多子网逐行独立徽标与延迟仲裁；
  - 直连物理网段自愈探测与子网代理一键下拉预选；
  - 基于 `fw3` (iptables) 的 WAN 区域入站访问放行与端口自动映射。

### 2. Tailscale Next 套件
基于 WireGuard 协议的高性能零配置虚拟网络工具。
- **tailscale-next**: 针对 OpenWrt 21.02 环境优化的 Tailscale 守护进程及客户端。
- **luci-app-tailscale-next**:
  - 提供节点登录认证、Tailnet 账号解析与状态实时监控；
  - 支持通告子网路由 (advertise-routes) 下拉选择与自愈注入；
  - 彻底剥离 `ucode` 依赖，纯 Lua 驱动后台。

### 3. Shadowsocks-rust Next
高性能异步 Rust 版 Shadowsocks 代理套件。
- **shadowsocks-rust-next**: 编译安装最新的 `ssserver`、`sslocal`、`ssmanager` 等组件。
- **luci-app-ssserver-next**: 纯 Lua 后端驱动的 Shadowsocks 服务端图形化配置。

### 4. frp Client Next
高性能反向代理内网穿透工具。
- **frpc-next**: 适配最新版 frp 客户端程序。
- **luci-app-frpc-next**: 全功能配置界面，支持 Admin API 热重载、多穿透规则与状态监控。

### 5. Lucky 网络工具箱 (纯 Lua 后端版)
功能强大的软路由运维综合服务套件。
- **lucky**: 集成端口转发、DDNS 动态域名解析、反向代理、WOL 网络唤醒等功能。
- **luci-app-lucky**: RPCD 后端全面使用 Lua 重构，无缝替换旧版 ucode 后台，保持原有前端全部功能。

### 6. Cloudflared Next
Cloudflare Tunnel (Argo Tunnel) 客户端。
- **cloudflared-next**: 适配最新版 Cloudflare 隧道客户端。
- **luci-app-cloudflared-next**: 隧道 Token 图形化配置与状态接管。

### 7. FlowProxy (iptables / ipset 纯净版)
基于 `iptables` / `ipset` 的高性能透明代理与旁路由分流工具。
- **luci-app-flowproxy**: 专为 OpenWrt 21.02 `fw3` 环境打造，彻底移除 nftables 依赖，采用纯 `iptables` 与 `ipset` 加载引擎，支持规则实时预览与运行状态可视化。

### 8. LinkBack 链路回流与守护
- **linkback**: 针对复杂多 WAN/多网段回流的高性能守护进程。
- **luci-app-linkback**: 图形化回流规则配置。

### 9. AP Switch 模式切换
- **luci-app-ap-switch**: 一键在路由器模式与瘦 AP (无线接入点) 模式之间切换的实用工具。

---

## 维护规范

本仓库中的所有 `-next` 系列软件包均遵循严格的工程开发规范：
- 每个包提供自动化的版本检查与更新机制；
- `init` 脚本优先保证系统网络安全与配置原子性，杜绝破坏性重载导致的网络中断；
- 代码严格经过双层审查与跨平台语法校验。

---

## 致谢与引用

本项目中的组件基于或参考了以下开源项目：
- EasyTier: https://github.com/EasyTier/EasyTier
- Tailscale: https://github.com/tailscale/tailscale
- shadowsocks-rust: https://github.com/shadowsocks/shadowsocks-rust
- frp: https://github.com/fatedier/frp
- Lucky: https://github.com/gdy666/lucky
- Cloudflared: https://github.com/cloudflare/cloudflared

