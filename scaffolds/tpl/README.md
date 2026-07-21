# scaffolds/tpl —— 云函数脚手架模板（**不可部署**）

本目录是**脚手架模板**，用于新建云函数时复制其 `helpers/` 隔离层结构，**不是可运行的云函数**。

## 为什么不能部署

- 仅有 `config.json` / `helpers/` / `package.json`，**缺少 `index.js` 业务入口**。
- `package.json` 中 `"main": "index.js"` 指向一个不存在的文件，部署会因入口缺失而失败。
- `helpers/db.js`、`helpers/user.js` 首行为 `// scaffolds/tpl/helpers/...`，明确表示其归属为模板，复制后需改为真实函数路径（已有 CI 脚本 `scripts/helper-comments.js` 校验）。

## 正确用法

新建云函数 `foo` 时：

```bash
cp -r scaffolds/tpl cloudfunctions/foo
# 1. 在 cloudfunctions/foo/index.js 编写业务主逻辑（只引用 ./helpers，禁止直连 cloud.*）
# 2. 将 cloudfunctions/foo/helpers/db.js、user.js 首行改为 // cloudfunctions/foo/helpers/...
# 3. 部署：bash uploadCloudFunction.sh <envId> foo <projectPath>
```

## 防误部署

`uploadCloudFunction.sh` 在 `FUNC_NAME=tpl` 时会直接拒绝部署，避免把脚手架当作可运行函数推上云。

> 本目录保留在仓库中作为规范范例，不参与任何云函数批量/单点部署。
