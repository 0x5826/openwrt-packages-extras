# luci-app-netbird-next

LuCI support for NetBird Mesh VPN (Next).

## 设计特性

### 1. 被动集成架构 (Passive Integration)
本插件采用了深度适配 OpenWrt 的被动集成模式,彻底解决了传统 NetBird 客户端与网关系统冲突的问题。
- 权限卸载: 强制启用 --disable-routing 和 --disable-firewall 参数,剥离 NetBird 对系统策略路由 (ip rule) 和 nftables 的直接操作。
- 接口标准化: 自动在 OpenWrt 系统中创建标准的 netbird 网络接口并绑定 wt0 设备,使 VPN 网卡受 netifd 统一管理。
- 兼容性保障: 由于移除了 NetBird 自有的高优先级策略路由,本插件可与 flowproxy、mwan3 等策略路由插件完美共存,互不干扰。

### 2. 原生防火墙管理
本插件将 NetBird 的流量控制完全收编至 OpenWrt 防火墙 (fw4) 框架下。
- 独立区域: 自动创建独立的 netbird 防火墙区域,实现 VPN 流量与本地局域网 (LAN) 的物理隔离。
- 自动转发: 脚本会自动配置 lan 与 netbird 区域之间的双向转发规则,确保内网设备能够无感访问 VPN 节点。
- 自动伪装: 默认在 netbird 区域开启 SNAT (Masquerade),解决多跳环境下回程路由缺失导致的连通性问题。

### 3. 稳健的安装密钥 (Setup Key) 逻辑
针对 NetBird 身份切换设计了原子化的自动处理流程。
- 变化监测: 通过本地状态文件记录上一次成功激活的密钥,实时监测 UCI 配置中的密钥变化。
- 原子重注册: 当用户修改密钥时,脚本会自动执行 netbird deregister 以彻底清除旧身份和本地残留配置,随后发起新密钥的注册流程。
- 安全存储: 密钥记录采用先写临时文件再执行重命名 (mv) 的原子化操作,确保在异常掉电情况下配置文件的完整性。

### 4. 生产级日志管理
针对嵌入式设备内存敏感的特性进行了专项优化。
- 内存保护: 将 NetBird 日志强制重定向至系统控制台,由 procd 统一收集并存入系统环形缓冲区 (Circular Buffer),永不占用额外的物理磁盘空间或持续消耗内存。
- 自动限额: 随系统 logread 自动循环覆盖,彻底消除日志撑爆路由器的风险。
- 日志分级: 支持在 UI 界面调节日志等级 (Debug/Info/Warn/Error),日常运行默认为 Warn 级别以保持系统清爽。

### 5. 现代可视化监控
基于 LuCI2 (JavaScript + ucode RPC) 标准构建。
- 实时状态: 动态展示连接状态 (Connected/Connecting/Disconnected) 并配以颜色反馈。
- 连接类型识别: 实时识别并显示每个节点的连接方式 (P2P 直接连接 或 Relayed 官方中转),方便优化网络质量。
- 版本透明: 在首页直接展示当前安装的 NetBird 程序版本号。

## 安装与同步

同步仓库代码后,直接在 OpenWrt 源码目录下执行:
```bash
scripts/feeds update dante_extras
scripts/feeds install -a -p dante_extras
make package/luci-app-netbird-next/compile V=s
```
