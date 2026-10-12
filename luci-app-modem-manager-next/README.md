# luci-app-modem-manager-next

现代化、轻量级、高可靠的 OpenWrt 蜂窝模组管理器（Next-Gen），专为 4G / 5G 移动宽带模组设计。

---

## 1. 架构设计与背景

在传统 OpenWrt 路由器环境中，官方及社区方案通常面临两大难题：
1. **重型依赖与功能受限**：基于 D-Bus 和桌面级 ModemManager (`mmcli`) 的方案占用内存大、启动慢，且对移远（Quectel）、广和通（Fibocom）、中兴（ZTE）等主流 5G/4G 模组的私有特性（锁频段、5G SA/NSA 模式切换、私有驱动切换、载波聚合查询等）支持不足，甚至默认禁止 AT 命令直接交互；
2. **串口竞争与死锁风险**：AT 串口为单工互斥字符设备。若前端定时轮询信号指标，极易与用户 AT 命令交互或模组底层注册产生冲突，引发端口死锁、数据乱码或缓冲区溢出。

`luci-app-modem-manager-next` 采用**“物理 Tab 独立解耦架构 + ucode 原生 RPC + 串口排他并发调度网关 + 异步双缓冲状态采集引擎”**，全面解决上述痛点。

---

## 2. 系统核心拓扑与执行流程

```text
               【内核层与热插拔】                                     【前端 LuCI2 界面】
        +-----------------------------+                       +-----------------------------+
        | USB 模组物理插拔 / 模式切换 |                       | 前端 Overview 页面 (5秒轮询)|
        +-----------------------------+                       +-----------------------------+
                      |                                                     |
             内核 UEvent 触发                                          ubus call (非阻塞)
                      v                                                     v
        +-----------------------------+                       +-----------------------------+
        | /etc/hotplug.d/usb/         |                       | rpcd ucode 插件 (luci.modem)|
        | 20-modem-hotplug 脚本       |                       | 直接秒级读取内存缓存 JSON   |
        +-----------------------------+                       +-----------------------------+
                      |                                                     ^
                  异步触发                                                  | 毫秒级零延迟读取
                      v                                                     |
        +-----------------------------+                       +-----------------------------+
        | modem-detect (快速探测)     | ── 更新设备缓存 ──>   | /tmp/run/modem-manager/     |
        +-----------------------------+                       | devices.json & status.json  |
                                                              +-----------------------------+
                                                                            ^
                                                                            | 原子写入最新指标
        +-----------------------------------------------------------+       |
        | 【后台单向采集守护器 (modem-collector)】                  |       |
        |                                                           | ──────+
        | 1. 定时触发采集周期 (默认 5 秒)                           |
        | 2. 检查终端活跃标记 (/var/lock/modem_terminal_active.lock) |
        |    ├─ [活跃中] -> 主动休眠避让，绝不碰串口                 |
        |    └─ [空闲中] -> 带 flock 单线程安全读取 AT 状态指标     |
        +-----------------------------------------------------------+
                      ▲
                      │ 标记终端操作已介入 (保持避让窗口 10 秒)
        +-----------------------------------------------------------+
        | 【用户在 AT 终端页执行指令 (Terminal Tab)】                |
        | 独占拥有最高优先级串口控制权，绝无后台轮询争抢导致死锁     |
        +-----------------------------------------------------------+
```

---

## 3. 核心机制实现

### 3.1 模块变动触发扫描机制 (Hotplug-driven Scan)
- 监听脚本：`/etc/hotplug.d/usb/20-modem-hotplug`；
- 行为：当模组发生物理插入、拔出，或在配置页面执行模式切换导致 USB 端点重新枚举时，内核 UEvent 异步唤醒脚本，触发 `/usr/libexec/modem-detect --cache` 重新建立设备拓扑清单，原子更新 `/tmp/run/modem-manager/devices.json`，并通过 ubus 广播事件通知前端视图。

### 3.2 初始状态扫描探测机制 (Boot & Startup Init)
- 引导期预热：在 `/etc/init.d/modem-manager` 启动引导期，后台异步执行一次 `modem-detect --cache`；
- 前端极速首屏：前端 RPC `get_devices` 优先读取内存缓存，实现 0 毫秒首屏呈现，彻底免除用户打开页面时的等待开销。

### 3.3 异步状态双缓冲与 AT 终端互斥主动避让 (Async Decoupled Polling & Active Yielding)
- **单一生产者**：后台常驻守护进程 `/usr/libexec/modem-collector` 作为与串口交互的唯一常规生产者，单线程采集 CSQ、CPIN、COPS、QENG、QTEMP 并原子更新 `/tmp/run/modem-manager/status.json`；
- **终端最高优先级**：用户通过控制台或快捷按钮发送指令（`send_at`）时，立即触碰激活 `/var/lock/modem_terminal_active.lock`；
- **主动退避**：后台采集器若检测到终端在过去 10 秒内有操作，立即放弃当前轮询并主动休眠，将串口控制权完全让渡给用户；
- **前端彻底解耦**：前端 Overview 页面的 5 秒轮询仅读取内存缓存文件，调用耗时为 `0.00s`，零串口开销，杜绝死锁与缓冲区阻塞。

### 3.4 纯 POSIX 原生串口执行器 (modem-at-executor)
- 零外部依赖：摆脱对 `chat`、`stty` 或专用工具的依赖，100% 兼容裁剪版 BusyBox；
- 互斥安全：基于 `flock -n -x 9` 非阻塞轮询实现文件级排他锁，防止多进程竞争；
- 超时保护与动态自适应：基于管道和时间窗口读取，普通指令 3 秒超时，长耗时指令（如 `AT+COPS=?` 全频段搜网）自适应动态提升至 60 秒超时，防止误截断。

### 3.5 AT 终端容错性与交互易用性增强
- **中英文标点智能转换**：自动将全角/中文引号（`“”`）、逗号（`，`）、问号（`？`）、冒号（`：`）、等号（`＝`）、加号（`＋`）智能清洗为标准半角 ASCII 字符，防止模组因多字节编码报错；
- **智能推测与模糊建议 ("Did you mean?")**：当指令执行失败时，利用编辑距离算法计算高频知识库，自动推测用户意图（例如误输 `AT+CPIM?` 时提示推测 `AT+CPIN?`，支持一键填入）；
- **行内实时自动补全 (Autocomplete)**：打字时自动匹配候选指令及中文功能简介，支持 Esc 快速关闭；
- **CME / CMS 错误码中文语义化**：内置 3GPP TS 27.007 错误码字典，将晦涩的数字代码（如 `+CME ERROR: 10/11/13/14`）自动解析为可读中文释义；
- **高危破坏性指令拦截预警**：拦截 `AT&F`、`AT+RESTORE` 等可能导致出厂重置的高危操作，弹窗二次确认；
- **耗时测量与日志导出**：毫秒级精度测量下发耗时，支持自定义收藏夹管理与一键导出排障日志文件。

### 3.6 主控制串口用户接管与持久化机制 (User-Configured AT Port Override)
- **设置入口**：在【设置 (Settings)】页面中提供专属“串口与通信参数配置”卡片；
- **候选端口与自定义路径**：下拉列表枚举该模组暴露的所有物理串口，默认选中国际推荐口（标有 `[自动推荐]`），并支持选择 `[自定义设备路径]` 手动输入专用软链接（如 `/dev/modem_at` 或 `/dev/ttyACM0`）；
- **配置与运行态全链路接管**：保存后写入 UCI `/etc/config/modem-manager` 的 `global.port`，后台采集器 `modem-collector`、前台总览页 `Overview` 与 RPC 接口均以用户指定端口作为最高优先级，彻底消除端口序号漂移和多串口设备误判风险。

### 3.7 物联网卡零干扰熔断机制与安全短信模块 (Safe SMS with IoT Guard)
- **默认全局熔断关闭**：考虑到部分物联网卡（IoT SIM）、企业遥测专用卡或定向纯流量卡对 SMS 业务存在特殊风控限制，若模组自动轮询或读取短信可能导致异常扣费、被运营商封卡或阻塞 AT 通道，系统在 UCI 中默认设置 `global.sms_enable=0`；
- **零串口开销**：在短信模块处于关闭状态时，后台采集守护器和 RPC 接口绝对不向模组发送任何短信读取、容量查询或配置指令；
- **显式激活与收发管理**：用户在【短信 (SMS)】页面可一键安全启用，支持 SIM 卡短信容量占用进度查看、收件箱列表阅读、UCS2/UTF-8 字符自适应解码、写信发送（带文本长度统计与手机号校验）及一键清空所有短信。

---

## 4. 目录与文件布局

```text
luci-app-modem-manager-next/
├── Makefile                                    # 软件包构建与权限配置
├── README.md                                   # 项目架构与设计文档
├── root/
│   ├── etc/
│   │   ├── config/modem-manager                # UCI 配置文件 (含 sms_enable)
│   │   ├── hotplug.d/usb/20-modem-hotplug      # USB 热插拔事件感知脚本
│   │   ├── init.d/modem-manager                # 系统守护服务脚本
│   │   └── uci-defaults/99_modem-manager-init  # 初始化脚本
│   └── usr/
│       ├── libexec/
│       │   ├── modem-at-executor               # 纯 POSIX 串口排他安全执行器 (含 SMS 发送)
│       │   ├── modem-collector                 # 后台异步状态采集与避让守护器
│       │   └── modem-detect                    # sysfs 设备枚举与关联扫描工具
│       └── share/
│           ├── modem-manager/templates/        # 厂商预置模版库
│           │   ├── quectel.json                # 移远模组规则 (RM500Q, RM500U, RG500U 等)
│           │   ├── fibocom.json                # 广和通模组规则 (FM650, FG650, NL668 等)
│           │   ├── zte.json                    # 中兴微模组规则
│           │   └── generic.json                # 通用 3GPP 模组规则
│           ├── luci/menu.d/
│           │   └── luci-app-modem-manager.json # 菜单路由定义 (含 SMS Tab)
│           └── rpcd/
│               ├── acl.d/luci-app-modem-manager.json # RPC 鉴权规则
│               └── ucode/luci.modem            # ucode RPC 插件 (含 SMS 接口)
├── htdocs/luci-static/resources/view/modem/
│   ├── overview.js                             # 【总览】：信号仪表盘、基站详情、SIM状态
│   ├── settings.js                             # 【设置】：驱动协议切换、频段锁定、APN
│   ├── sms.js                                  # 【短信】：物联网卡安全防护、短信收发展示
│   ├── templates.js                            # 【模版】：厂商模版查看与参数管理
│   ├── terminal.js                             # 【终端】：高级交互控制台与快捷预设指令
│   └── log.js                                  # 【日志】：AT 交互与系统运行日志
└── po/
    ├── templates/modem.pot                     # 翻译模板
    └── zh_Hans/modem.po                        # 中文简体翻译 (无 Emoji、无中英混杂)
```

---

## 5. 验证与兼容性

本软件包已在真实硬件环境中完成验证：
- **测试环境**：ImmortalWrt 25.12 (MediaTek Filogic, aarch64)
- **测试模组**：移远通信 RM500U-CNV (USB ID: `2c7c:0900`)
- **驱动协议**：`cdc_ncm` (`usb0`)
- **网络制式**：中国电信 5G 独立组网 (NR5G-SA, N78 频段)
