# 常规维护指南

本项目为 OpenWrt 附加软件包仓库（`main` 分支，适用于较新版 OpenWrt/`fw4` 环境），包含一些 `-next` 软件源。为保持二进制程序及启动脚本的高可用性，需进行定期常规维护。

---

## 1. 维护目标清单

| 包名 | 上游项目名称 | 源码托管地址 |
| :--- | :--- | :--- |
| `cloudflared-next` | cloudflared | `cloudflare/cloudflared` |
| `frpc-next` | frp | `fatedier/frp` |
| `shadowsocks-rust-next` | shadowsocks-rust | `shadowsocks/shadowsocks-rust` |

---

## 2. 常规二进制升级流程

以升级二进制包版本为例，标准步骤如下：

### 第一步：检查上游最新版本
使用 GitHub API 或页面获取最新 Tag：
```bash
# 示例：检查 cloudflared 的最新 Release Tag
curl -s https://api.github.com/repos/cloudflare/cloudflared/releases/latest | grep '"tag_name":'
```

### 第二步：计算新版源码包 SHA256 校验和
依据 Makefile 中的 `PKG_SOURCE_URL`，使用 `curl` 下载对应版本源码包并计算 `sha256sum`：
```bash
# 示例：获取 2026.7.2 的 SHA256 校验和
curl -sL "https://codeload.github.com/cloudflare/cloudflared/tar.gz/2026.7.2" | sha256sum
```

### 第三步：修改 Makefile
编辑对应软件包目录下的 `Makefile`，更新以下变量：
* `PKG_VERSION:=<最新版本号>`
* `PKG_HASH:=<计算得出的 SHA256 校验和>`
* *注：若存在 `PKG_RELEASE`，在版本更新时建议重置为 `1`。*

### 第四步：本地安全校验与测试
* 运行 `git diff` 确认修改范围仅限于版本号与哈希值。
* 确保没有敏感信息（如私钥、本地测试配置）被意外修改或保存。

---

## 3. 提交与推送规范

1. **Commit 格式**：
   符合历史 Commit 风格：`[<包名>] 更新版本至 <版本号>`
   * 示例：`[cloudflared-next] 更新版本至 2026.7.2`
2. **提交粒度**：坚持“一包一 Commit”原则，不要将多个包的更新混在一个 Commit 中提交。
3. **推送控制**：Commit 后需进行人工审查，确认无风险后再执行 `git push`。
