# OpenWrt Packages Extras (主分支: OpenWrt 23.05+ / 24.x / 25.x)

本项目是专为现代 OpenWrt / ImmortalWrt 固件生态打造的高性能软件包扩展源（Feed），侧重于提供最新发行版本（Next 系列）的网络工具、VPN 组网、加密代理及对应的现代化 LuCI 管理界面，支持自动化版本更新与持续集成构建。

---

## 适用系统架构与发行版本

- **适用发行版**: OpenWrt 23.05 / 24.10 / 25.x、ImmortalWrt 23.05+ 及更新的现代分支版本。
- **底层技术特征**:
  - **Linux 内核**: 5.15 / 6.x 及更新版本。
  - **防火墙架构**: 原生采用 `fw4` (nftables / inet 规则集)。
  - **RPCD 后端**: 原生基于 `rpcd-mod-ucode` (`/usr/share/rpcd/ucode/*.uc`)，与系统的 ACL 访问控制权限体系深度协同。
  - **前端视图**: 纯客户端 JavaScript (LuCI2 视图架构)，采用原生 CBI 表单组件并深度优化异步 Promise 数据流。
- **旧版本兼容说明**: 若需在 OpenWrt 21.02 / 21.02-SNAPSHOT（Linux 5.4 内核 / `fw3` iptables / 纯 Lua RPCD 环境）中使用，请切换至本项目的 `openwrt-21.02` 独立维护分支。

---

## 前后端架构与 RPC 服务特征

### 1. 前端架构特征
- **纯客户端单页渲染**: 采用 LuCI2 现代 JavaScript API (`form.Map`, `form.DynamicList`, `form.NamedSection`)，提升页面响应速度；
- **全景拓扑动态可视化**: 内置轻量级 SVG 矢量拓扑图渲染引擎，支持多节点分层布局、链路延迟智能仲裁与代理网段独立排版；
- **组件规范化交互**: 状态指示与服务控制紧凑内嵌，去除多余冗余卡片，与 OpenWrt 官方设计规范保持统一；
- **多层降级容错**: 前端解析全面兼容非严格数据结构，具备异常自动捕获与防抖轮询机制。

### 2. 后端服务与 RPC 方法定义
主分支后端核心服务采用 `ucode` 高性能脚本编写（位于 `/usr/share/rpcd/ucode/`），并通过 `/usr/share/rpcd/acl.d/` 严密声明 ubus 接口权限。主要包含以下通用 RPC 方法：

| RPC 方法名称 | 说明 | 特征实现机制 |
| :--- | :--- | :--- |
| `get_status` | 核心服务与后台状态查询 | 结合 `ubus service list` 及守护进程 PID 自省，精准区分托管运行、非托管运行与停止状态 |
| `get_peers` | 对等连接节点明细查询 | 解析底层客户端 JSON/表格输出，自动与路由表关联合并代理网段 (proxy_cidrs) |
| `get_topology` | Mesh 拓扑全景图数据提取 | 自动过滤重启残留的幽灵脏数据节点，精准仲裁双向链路延迟 |
| `get_subroutes` | 直连物理子网多层自愈探测 | 三层自愈逻辑：优先 `ip -j route` -> 降级标准文本正则提取 -> 终极兜底 `ubus network.interface dump` |
| `get_logs` | 运行日志读取 | 优先读取系统 `logread`，降级读取临时日志文件，支持安全行数收敛 |
| `clear_logs` | 运行日志安全清空 | 原子清空临时日志缓冲区 |
| `service_action` | 服务生命周期安全管理 | 严格执行平滑重启、停止与僵尸进程强杀收敛接管 |

---

## 编译引入 Feed 源操作指引

在您的 OpenWrt 源码根目录下，编辑 `feeds.conf.default` 文件，添加本仓库源：

```bash
# 添加主分支 Feed 源 (适用于 OpenWrt 23.05 / 24.x / 25.x)
src-git dante_extras https://git.seckv.com/dante/openwrt-packages-extras.git
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
- **easytier-next**: 官方最新版本 EasyTier 核心及命令行工具编译包。
- **luci-app-easytier-next**:
  - 提供核心运行状态与 Web 控制台一键联动；
  - 动态 SVG 全景网络拓扑图，支持多子网逐行独立徽标与延迟仲裁；
  - 直连物理网段自愈探测与子网代理一键下拉预选；
  - WAN 区域入站访问放行与端口自动精准映射。

### 2. Tailscale Next 套件
基于 WireGuard 协议的高性能零配置虚拟网络工具。
- **tailscale-next**: 最新版 Tailscale 守护进程及 CLI 客户端。
- **luci-app-tailscale-next**:
  - 提供节点登录认证、Tailnet 账号解析与状态实时监控；
  - 支持通告子网路由 (advertise-routes) 下拉选择与自愈注入；
  - 防火墙接口与 hotplug 路由原子化恢复机制。

### 3. Shadowsocks-rust Next
高性能异步 Rust 版 Shadowsocks 代理套件。
- **shadowsocks-rust-next**: 编译安装最新的 `ssserver`、`sslocal`、`ssmanager` 等组件。
- **luci-app-ssserver-next**: 规范化的 Shadowsocks 服务端图形化配置与进程守护。

### 4. frp Client Next
高性能反向代理内网穿透工具。
- **frpc-next**: 适配最新版 frp 客户端程序。
- **luci-app-frpc-next**: 全功能配置界面，支持 Admin API 热重载、多穿透规则与状态监控。

### 5. Lucky 网络工具箱
功能强大的软路由运维综合服务套件。
- **lucky**: 集成端口转发、DDNS 动态域名解析、反向代理、WOL 网络唤醒等功能。
- **luci-app-lucky**: Lucky 后台集成与端口快速直达。

### 6. Cloudflared Next
Cloudflare Tunnel (Argo Tunnel) 客户端。
- **cloudflared-next**: 适配最新版 Cloudflare 隧道客户端。
- **luci-app-cloudflared-next**: 隧道 Token 图形化配置与状态接管。

### 7. FlowProxy (nftables 现代版)
基于 `nftables` 的高性能透明代理与旁路由分流工具。
- **luci-app-flowproxy**: 专为 OpenWrt 23.05+ `fw4` 环境打造，支持基于 nftables inet 表的高性能流量引流、规则实时预览与运行状态可视化。

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

