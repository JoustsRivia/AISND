# 部署手册（DEPLOY.md）

本手册覆盖部署与运维中需在**云平台侧**完成、无法由代码仓库直接表达的配置动作。
代码本身已原生支持下述能力，无需修改源码即可生效。

---

## 1. 种子管理员强口令（安全部署必做）

> 对应迭代建议 item 1。代码位置：`cloudfunctions/system/index.js` 的 `seedAdmin`。

`seedAdmin` 优先读取云函数**环境变量**作为管理员初始凭证；若两项均未配置，则回退到内置默认口令 `Jousts / qwer1234` 并输出 `console.warn` 告警（回退值**刻意保留**，避免「未配置环境变量即空口令锁死 / 永久无法登录」的可用性事故）。

### 1.1 在微信云开发 / 云函数环境变量中配置

为 `system` 云函数设置以下环境变量（建议强口令，长度 ≥ 12，含大小写+数字+符号）：

| 变量名 | 说明 | 示例 |
|---|---|---|
| `SEED_ADMIN_USERNAME` | 小程序管理员初始账号 | `admin` |
| `SEED_ADMIN_PASSWORD` | 小程序管理员初始口令（强口令） | `Kp#9mQ2$vLx7` |

配置路径（微信开发者工具）：
「云开发控制台 → 云函数 `system` → 配置 → 环境变量」新增上述两项并**保存/重新部署**。

### 1.2 验证

1. 部署后首次触发 `seedAdmin`（登录页「初始化管理员账号」按钮）。
2. 服务端不再输出 `正在使用内置默认管理员凭证` 告警（说明环境变量已生效）。
3. 使用配置的账号/口令登录，并**立即在系统管理后台修改**为个人口令。

> ⚠️ 切勿把强口令写回前端或提交进源码。凭证由后端持有，仅通过 `seedAdmin` 返回值**一次性**展示给管理员。

---

## 2. 云函数部署

单函数部署（推荐，避免误部署脚手架）：

```bash
bash uploadCloudFunction.sh <envId> <functionName> <projectPath>
# 例：bash uploadCloudFunction.sh prod-1f2a3b auth /path/to/project
```

- `cloudfunctions/tpl` 为脚手架模板，**禁止部署**（脚本已内置拒绝）。
- 各业务函数在 `cloudfunctions/<fn>/` 下，需各自携带 `index.js` + `helpers/` + `package.json`。

---

## 3. 持续集成校验（仓库内可运行）

本地即可验证两项仓库内质量门禁：

```bash
# helpers 首行注释规范（item 6）：必须全部为真实路径
node scripts/helper-comments.js

# 云函数核心业务单测（item 2）：auth / purchase / scrap
node --test cloudfunctions/_tests/cloud-functions.test.js
```

> 根目录 `package.json` 已封装脚本：`npm run lint:helpers` 与 `npm test`。

### 3.1 质量门禁默认开启（pre-commit 钩子）

仓库已内置 `scripts/install-hooks.js`，在提交前自动运行「helpers 注释规范 + 隔离层单一源校验」两道卡点，拦截回归。

- **默认开启**：执行 `npm install` 时，`package.json` 的 `prepare` 脚本会自动安装该钩子，开发期无需手工操作。
- **手动安装**：`npm run hooks:install`（仅在 git 仓库根目录有效；非 git 环境会优雅跳过，不报错）。
- **跳过本次提交**：`git commit --no-verify`（仅应急使用）。

---

## 4. 推荐部署顺序（首run）

1. 开通云开发环境，记录 `envId`。
2. 配置 `system` 云函数环境变量（`SEED_ADMIN_*`）。
3. 逐个部署云函数（建议优先 `auth`、`system`、`tool`）。
4. 上传并部署小程序（微信开发者工具「上传」）。
5. 首启 → 初始化管理员账号 → 配置组织树与字典 → 录入台账。
