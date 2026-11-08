# Railway 接入 Supabase PostgreSQL

本次增加可选的 PostgreSQL 数据库。Railway 配置 `DATABASE_URL` 后，项目、素材记录、任务、设置和回调记录存入 Supabase 的 `tuxu` schema；图片、交付文件、技能上传记录和访客签名秘密继续保存到现有 Railway Volume。原 Sites 的 D1/R2 部署继续使用原接口。

## Railway 设置

保持构建命令 `npm run build` 和启动命令 `npm run start:railway`。当前启动流程会在监听端口前完成建表和旧数据导入，不需要另设 Pre-Deploy Command；卷在该阶段尚不可用。

| 变量 | 值 |
| --- | --- |
| `DATABASE_URL` | Supabase → Connect → Session pooler 的完整 PostgreSQL URI，使用 5432 端口，并带上 `?sslmode=require` |
| `TUXU_DATA_DIR` | `/data`，与已挂载的 Volume 路径一致 |
| `DATABASE_CA_CERT` | 可选。下载的 Supabase 数据库根证书 PEM；配置后验证证书链 |

将连接串中的密码占位符替换为数据库密码，并只对密码部分做 URL 编码。连接串属于服务端秘密，不放入 `VITE_*` / `NEXT_PUBLIC_*`、源码或聊天。只在 Railway 的变量值中填写它。

Session pooler 的用户名是 `postgres.<project-ref>`，主机名必须从 Connect 复制，不能根据区域猜测。本运行时使用会话状态和迁移事务，不使用 6543 端口的 Transaction pooler。

如沿用 `db.<project-ref>.supabase.co:5432` 直连，Railway 服务需启用 Outbound IPv6，或 Supabase 项目已提供 IPv4 直连。IPv6 在服务的 Settings → Networking → Enable Outbound IPv6 开启，然后应用暂存更改并重新部署；默认关闭时会报 `ENETUNREACH`。保留已有 AI 和访客配置。

`sslmode=require` 保证加密；`sslmode=verify-full` 还会验证服务端证书与主机名，私有 CA 需通过 `DATABASE_CA_CERT` 提供。未指定模式时默认验证证书。程序拒绝禁用 SSL 的连接。

Railway 启动器会在同一容器的 `127.0.0.1` 自动建立临时 PostgreSQL 监听端口，由 Node.js 按上述配置连接远端并完成 TLS，然后转发网页运行时的数据库协议。这避免 workerd 的 TLS 实现忽略自定义 CA 和验证选项。该端口不对公网监听，不另加 Railway 变量或端口映射；远端拒绝 TLS 或证书验证失败时，不转发数据库认证信息。原 Sites 的 D1 路径不经过此端口。

## 启动与旧数据

1. 连接 PostgreSQL，并在事务内取得应用迁移锁。
2. 在独立的 `tuxu` schema 建立五张业务表与迁移记录。业务表启用 RLS，不开放给 Supabase 的公共 Data API。连接角色需有建表权限并能访问这些后端表；Supabase Connect 默认的 `postgres` 角色满足当前用途。
3. 读取 `${TUXU_DATA_DIR}/state/v3/d1/` 下的旧数据库。仅当源库含完整业务表、有数据、目标业务表为空时自动复制，保留访客 ID、项目 ID、版本、时间和文件键。
4. 导入成功后记录完成标记。后续启动跳过导入；源 SQLite 文件不会被删除或修改。
5. 失败时回滚并停止启动，不悄悄切回本地 D1。目标已有业务数据且没有导入标记，或源目录有多个业务库时，停止以避免混合不同数据集。

导入只能搬运卷里仍存在的数据。此前未挂卷时丢失的容器数据无法自动恢复；已导出的项目可在网站重新导入。访客仍依赖同一浏览器 Cookie，保留卷中的 `visitor-session-secret` 或原 `VISITOR_SESSION_SECRET`，避免切换签名秘密导致旧访客无法进入原空间。

新迁移追加到 `postgres/NNNN_description.sql`，不要修改已执行文件。迁移器会核对 SHA-256；SQLite 的 `drizzle/` 迁移继续单独维护，不可直接交给 PostgreSQL 执行。`db/schema.postgres.ts` 是对应的 PostgreSQL 模型。

维护时可在已有安全环境变量的进程执行 `npm run db:migrate:postgres`。该命令会尝试上述旧数据导入，不是仅生成 SQL，也不会自动加载本地 `.env.local`。应用启动时已自动调用，无需重复手动运行。

## 核验

部署完成后，`/api/health` 必须返回：

```json
{
  "status": "ok",
  "databaseProvider": "postgresql",
  "databaseConnected": true,
  "databaseSchema": "tuxu",
  "databasePersistent": true,
  "storagePersistent": true
}
```

数据库状态来自一次真实的业务表查询，不能只凭环境变量或启动日志认定接入完成。`databasePersistent` 描述数据库；`storagePersistent` 仍描述图片和文件的卷配置。

连接失败时，健康接口和启动日志只返回固定错误代码，不返回连接串或密码。`28P01` 表示凭证不匹配，`ENETUNREACH` 表示出站网络不可达，`USE_SESSION_POOLER` 表示连接模式不兼容，`LOCAL_IMPORT_TARGET_NOT_EMPTY` 表示目标已有业务数据且未执行自动合并。

在网页新建测试项目，Supabase Table Editor 选择 `tuxu` schema，核对 `projects` 记录。上传测试图片、重新部署后，保持同一浏览器会话检查项目和文件仍能打开。不要用生产作品进行删除测试。

## 已验证与限制

- PostgreSQL 测试使用真实 PostgreSQL WASM 引擎与同一 `pg` 驱动，覆盖迁移重入、事务回滚、旧库只读导入与冲突拒绝、项目读写/版本冲突、访客隔离、图片记录、任务配额和 JSON 查询。
- 传输检查使用自签名的本地 TLS PostgreSQL 端点，验证 CA、拒绝非 TLS/不受信任端点，以及实际 workerd 请求通过 Node TLS 连接查询。构建后的完整 Railway 启动流程另通过 13 项 PostgreSQL API 检查；这些本地结果仍需与真实 Supabase 验收分开。
- 本机不保存生产数据库密码；测试不连接或修改真实 Supabase，也不调用付费 AI。线上接通必须通过上述部署核验，不能以本机测试代替。
- Worker 每个 API 请求独立连接数据库，回调背景工作结束后再关闭连接；会话池由 Supabase 管理。图片仍依赖单服务 Volume，继续保持现有单实例部署。

参考：[Supabase 连接说明](https://supabase.com/docs/guides/database/connecting-to-postgres)、[Railway 出站网络](https://docs.railway.com/networking/outbound-networking)、[Railway Volumes](https://docs.railway.com/volumes)。
