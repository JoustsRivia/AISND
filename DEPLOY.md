# 部署手册（DEPLOY.md）

本手册覆盖部署与运维中需在**云平台侧**完成、无法由代码仓库直接表达的配置动作。
代码本身已原生支持下述能力，无需修改源码即可生效。

---

## 1. 初始化首个管理员账号

> 代码位置：`cloudfunctions/system/index.js` 的 `userManage`（op=add，仅现有管理员可操作）。

本系统**已移除**一键 `seedAdmin` 机制（避免默认口令留存与越权接管风险）。首个管理员通过在**云开发控制台手动写入 `users` 集合**完成：

1. 在云开发控制台 → 数据库 → `users` 集合，新增一条记录：
   - `role: "admin"`、`status: "active"`、`bound: true`
   - `username` / `password` 使用 `sha1("tms_" + 明文口令)` 后的哈希值（与 `cloudfunctions/auth`、`system` 同源）
   - `openid` 留空，首次微信登录时由 `auth.signin` 自动绑定当前身份
2. 用该账号/口令在登录页登录，即可进入系统管理后台。
3. 后续管理员由现有管理员在「系统管理 → 用户管理」中指派，杜绝自助越权。

---

## 2. 云函数部署

单函数部署（推荐，避免误部署脚手架）：

```bash
bash uploadCloudFunction.sh <envId> <functionName> <projectPath>
# 例：bash uploadCloudFunction.sh prod-1f2a3b auth /path/to/project
```

- `scaffolds/tpl` 为脚手架模板，**禁止部署**（脚本已内置拒绝）。
- 各业务函数在 `cloudfunctions/<fn>/` 下，需各自携带 `index.js` + `helpers/` + `package.json`。

---

## 3. 持续集成校验（仓库内可运行）

本地即可验证两项仓库内质量门禁：

```bash
# helpers 首行注释规范（item 6）：必须全部为真实路径
node scripts/helper-comments.js

# 云函数核心业务单测（item 2）：auth / purchase / scrap
node --test tests/cloud-functions.test.js
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
2. 在云开发控制台 `users` 集合手动写入首个管理员账号（见 §1）。
3. 逐个部署云函数（建议优先 `auth`、`system`、`tool`）。
4. 上传并部署小程序（微信开发者工具「上传」）。
5. 首启 → 登录管理员账号 → 配置组织树与字典 → 录入台账。
