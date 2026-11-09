# 账户登录与独立工作空间（0.5.0）

Railway 网站使用账户登录，地址为 https://p-design.up.railway.app/login 。管理员账户名为 `admin`，初始密码按本次用户指定值初始化；源码只保存单向验证值。第一次登录创建管理员记录，后续部署和登录不会覆盖已经修改的密码。

## 使用方法

1. 管理员登录，点击右上角「我的账户」→「管理账户」。
2. 填写账户名、显示名称（选填）和初始密码，创建普通账户。
3. 将账户名和初始密码交给使用者。使用者通过同一登录页进入自己的工作空间，无需配置 AI 密钥或安装技能。
4. 所有账户均可在「我的账户」修改自己的密码或退出登录；密码更新后所有设备需要重新登录。
5. 管理员可以停用、重新启用普通账户。停用撤销其所有登录会话，保留原有作品，启用后可继续使用。管理员自身不能被此入口停用。

账户名为 3–32 位英文、数字、点、横线或下划线，以英文或数字开头，统一按小写存储。密码长度为 8–128 个字符。普通账户没有账户管理权限，创建请求不能自行提升为管理员。

## 隔离边界

- 项目、素材、AI 任务、交付下载和个人额度以稳定的账户 ID 检查所有权。管理员负责账户管理，不获得读取其他账户作品的通行权限。
- 本机 IndexedDB 以账户 ID 分库。新账户不会自动接收旧访客、原 Sites 所有者或其他账户的缓存。
- 所有公开请求中的平台身份头都会被清除，身份只从有效登录会话取得。写入请求还必须匹配编辑器加载时的账户 ID，拒绝旧标签页在换号后继续保存。
- 退出或换号通过浏览器标签页通信同步关闭旧工作区；重新聚焦也会核对登录身份。已同步的项目可跨电脑继续编辑，尚未同步的修改仍应下载备份。
- 云端保存成功后，再把新版本号和同步状态写回本机缓存，避免重开页面时误报旧版本冲突。

## 服务端与存储

`scripts/start-railway.mjs` 默认设置 `ACCESS_MODE=accounts`。现有 Railway 服务无需增加登录秘密或修改启动命令；原 Sites 仍保留平台认证。`TUXU_LOCAL_VISITOR_QA=true` 仅对回环 origin 生效，供既有访客回归检查使用，不能用它在公网开放匿名编辑。

新增迁移：PostgreSQL 的 `postgres/0001_accounts.sql` 和 D1 的 `drizzle/0003_accounts.sql`。包含 `accounts`、`account_sessions`、`login_attempts`，启动自动应用。旧项目保留原归属，不自动分配给任何新账户。将本地 D1 导入空 PostgreSQL 时，也保留已有的账户验证值、会话和时间戳。

密码使用每次随机盐的 PBKDF2-HMAC-SHA256、600,000 次迭代。生产运行时已实际验证原生 `node:crypto` 路径；设计依据为 [OWASP 密码存储建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) 和 [Cloudflare Node Crypto 文档](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)。浏览器获得随机登录令牌，数据库仅存令牌 SHA-256 摘要。会话有效期七天，Cookie 使用 HttpOnly、SameSite=Lax，HTTPS 下采用 Secure 与 `__Host-` 前缀；身份响应和私人文件禁止缓存。退出、改密和停用会删除相应会话。

登录写入必须同源；15 分钟内同一账户名最多尝试 10 次，全站最多 180 次。计数保存在数据库。用户是否存在、停用和密码错误均返回同样的登录提示。账号、会话和限流表在 PostgreSQL 启用 RLS，供可信服务端访问。

配置 `DATABASE_URL` 时，账户、会话和项目记录保存在现有 PostgreSQL。图片和交付文件仍依赖既有 Railway Volume；账户功能不会替代文件存储。保持现有单实例部署及已修复的 TLS 转发配置。

## 开发与验证

修改入口：`server/accounts.ts`、`server/account-bootstrap.ts`、`worker/index.ts`、`src/accounts.js`、`src/cloud.js`、`src/app.js`、`public/accounts.css`。修改前端后重新构建编辑器。

```powershell
npm run test:accounts
node --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

账户测试使用专用的测试引导验证值，覆盖 SQLite 和真实 PostgreSQL 引擎，不使用生产密码。需要运行登录界面时，先构建，再为独立本地数据目录设置 `TUXU_RUNTIME=railway`、`APP_ORIGIN=http://127.0.0.1:5190`、`PORT=5190`、`TUXU_DATA_DIR`，运行 `npm run start:railway`；无真实 AI 测试需求时设置 `AI_ENABLED=false`、`SKILL_FILES_JSON={}`，无需 API 密钥。

上线后核对 `/api/health` 的 `accessMode=accounts`、当前提交和数据库连接；用实际登录验证管理员入口及 Cookie。测试账户隔离应在独立环境完成，不清理或修改真实用户作品。证据保存在忽略目录 `qa/railway/accounts/`，发布成功与本机测试分别记录。
