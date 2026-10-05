# 部署指南

三条路径，按需要选：

| 场景 | 用哪条 | 依赖 |
|---|---|---|
| 本地演示 / 开发联调 | [路径 A](#路径-a本地与局域网演示推荐先做这个) | 只要 Node |
| 内网穿透给外部看 | [路径 B](#路径-b内网穿透让外部临时访问) | Node + cloudflared |
| 正式云服务器部署 | [路径 C](#路径-c云服务器正式部署docker) | 阿里云/腾讯云 ECS + 域名 |

---

## 路径 A：本地与局域网演示（推荐先做这个）

### A1. 后端（Demo 模式，零外部依赖）

```bash
pnpm install
pnpm --filter "./packages/*" run build
pnpm dev:api                       # http://localhost:3100
curl http://localhost:3100/api/health
```

`DATA_DRIVER=memory` 时启动即播种演示数据（18 用户 / 24 款 / 31 内容 / 54 加微记录），
不需要 MySQL、Redis、RabbitMQ、ES。

### A2. H5 / PC Web 用户端

```bash
pnpm dev:h5                        # http://localhost:10086
```

H5 devServer 已配置 `/api` 与 `/uploads` 代理到 `http://localhost:3100`（见 `apps/miniapp/config/index.ts`）。

### A3. 运营后台

```bash
pnpm dev:admin                     # http://localhost:3101
```

登录页选「七叔（平台运营）」一键进入；查看厂家加微看板请选「广州·意法·简派制衣」。

### A4. 小程序端（本地）

```bash
pnpm --filter @wfb/miniapp run build:weapp --watch
```

用微信开发者工具导入 `apps/miniapp/dist/weapp`，**勾选「不校验合法域名」**（因为本地是 http）。

### A5. 局域网给同事看

```bash
# 后端监听 0.0.0.0（默认已是），H5 也监听 0.0.0.0
# 找到本机内网 IP，例如 192.168.1.20，同事访问：
#   H5    http://192.168.1.20:10086
#   后台  http://192.168.1.20:3101
```

注意：H5 是浏览器端直连 `/api`（经 devServer 代理），后台生产构建后需要 `NEXT_PUBLIC_API_BASE` 指向后端。

---

## 路径 B：内网穿透（让外部临时访问）

适合「今天就要给客户/合伙人看」的场景。项目自带封装脚本，避免手动记命令。

### B1. 快速隧道（零配置，域名随机）

```bash
# 1) 起后端与演示服务器（两个终端）
pnpm dev:api            # 3100
pnpm serve:demo         # 8099（H5 + 后台 + /api 反代）

# 2) 一次性下载 cloudflared 到 tools/（不入库）
#    Windows:
#    Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile tools/cloudflared.exe
#    macOS:  brew install cloudflared && mkdir -p tools && ln -s $(which cloudflared) tools/cloudflared
#    Linux:  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o tools/cloudflared && chmod +x tools/cloudflared

# 3) 开隧道（会自动打印公网地址并落盘状态）
pnpm tunnel:quick
#   → https://xxxx-yyyy-zzzz.trycloudflare.com
#     用户端   https://.../
#     运营后台 https://.../admin/
#     API      https://.../api/health
```

管理隧道：
```bash
pnpm tunnel:status      # 查看当前公网地址与进程状态
pnpm tunnel:stop        # 演示结束立即关闭
```

### B2. 命名隧道（固定域名，推荐长期演示）

随机域名每次重启都会变、没法写进文档。要固定域名需要一个免费 Cloudflare 账号 +
把域名托管在 Cloudflare（免费版可用）：

```bash
pnpm tunnel --login                       # 浏览器授权，选择你的域名
pnpm tunnel --name wfb-demo --hostname demo.yourdomain.com
# 之后每次只需：pnpm tunnel --name wfb-demo --hostname demo.yourdomain.com
```

### B3. 必须注意的三件事

1. **快速隧道地址是公开的**：任何人拿到 URL 都能访问，演示完请立刻 `pnpm tunnel:stop`。
2. **小程序端不能用穿透域名**：微信/抖音/支付宝要求 `TARO_APP_API` 是**已备案**的 https 域名并加入白名单，
   `*.trycloudflare.com` 过不了审核。穿透地址只适合让人用**浏览器**看 H5 / PC Web 与运营后台。
3. **前端要指向公网后端时**，构建期注入即可：
   ```bash
   TARO_APP_API=https://your-tunnel.example.com pnpm --filter @wfb/miniapp run build:h5
   ```

### B4. 手工方式（不用脚本）

```bash
cloudflared tunnel --url http://localhost:8099
```

---

## 路径 C：云服务器正式部署（Docker）

### C1. 服务器准备

- ECS：2 核 4G 起（要跑 MySQL + Redis + RabbitMQ + ES 建议 4 核 8G）
- 安全组开放：`22`（SSH）、`80`、`443`；数据库端口**不要**对公网开放
- 安装：Docker 24+ 与 Docker Compose v2；Node 20+（若要本地构建前端）

### C2. 拉代码并配置环境变量

```bash
git clone <your-repo-url> women-fashion-b2b && cd women-fashion-b2b
cp .env.example .env
vim .env       # 至少改：DB_PASSWORD、JWT_SECRET、DATA_DRIVER=mysql
```

`.env` 关键项：

```env
DATA_DRIVER=mysql
DB_PASSWORD=<强密码>
JWT_SECRET=<随机 32 位以上字符串>
PUBLIC_BASE_URL=https://your-domain.com
AI_API_KEY=<可选；不填则工具走本地规则引擎>
```

### C3. 起中间件 + 后端

```bash
docker compose -f docker/docker-compose.yml up -d mysql redis
# MySQL 首次启动会自动执行 docker/schema.sql（22 张表 + 2 个视图 + 版本权益数据）
docker compose -f docker/docker-compose.yml logs -f mysql | head -30

docker compose -f docker/docker-compose.yml up -d --build api
curl http://localhost:3100/api/health
```

`api` 服务用 `docker/api.Dockerfile` 多阶段构建，最终镜像只含 `dist` 与生产依赖。

### C4. 构建前端静态产物并挂 Nginx

```bash
# H5 / PC Web 用户端
pnpm install
pnpm --filter "./packages/*" run build
TARO_APP_API=https://your-domain.com pnpm --filter @wfb/miniapp run build:h5
# 产物：apps/miniapp/dist/h5

# 运营后台
NEXT_PUBLIC_API_BASE=https://your-domain.com pnpm --filter @wfb/admin run build
# 产物：apps/admin/.next（可用 pm2 常驻：pnpm --filter @wfb/admin start）
```

在 `docker/nginx.conf` 里把 `server_name` 改成你的域名，证书放到 `docker/certs/`：

```bash
sudo certbot certonly --standalone -d your-domain.com     # 或用云厂商免费证书
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem   docker/certs/
docker compose -f docker/docker-compose.yml --profile prod up -d nginx
```

访问 `https://your-domain.com` 即为 H5/PC Web 用户端，`/api/*` 反代到后端。

### C5. 切到 MySQL 需要补的工作

Demo 模式下数据层是 `apps/api/src/core/db.ts` 的内存 `Store`；切 MySQL 时：

1. 用 `docker/schema.sql` 建表（已自动执行）。
2. 在 `apps/api/src/core/db.ts` 旁实现同接口的 MySQL 仓储（`Store` 接口就是数据访问契约），
   或按需为热点模块先做（`users` / `manufacturer_products` / `knowledge_articles` 三张表优先）。
3. 把 `createStore()` 的 `driver` 分支接到 MySQL 实现，`DATA_DRIVER=mysql` 即生效。

`/api/health` 会返回 `driver` 字段，可直接确认当前数据源。

---

## 小程序提审清单

| 项 | 微信 | 抖音 | 支付宝 |
|---|---|---|---|
| 账号 | 微信公众平台小程序账号（需 300 元认证） | 抖音开放平台 | 支付宝开放平台 |
| 材料 | 营业执照、法人身份证、对公账户、ICP 备案 | 营业执照、法人身份证、类目资质 | 营业执照、商户认证 |
| 服务端域名 | 需 ICP 备案 + https + 加入 request 合法域名 | 同左 | 同左 |
| 构建产物 | `dist/weapp` | `dist/tt` | `dist/alipay` |
| 审核周期 | 5-7 个工作日 | 1-2 个工作日 | 1-3 个工作日 |

**内容安全消息推送配置（必需，否则图片异步审核收不到回调）**：

1. 登录微信公众平台 → 开发 → 开发设置 → 消息推送
2. 开启消息服务
3. 服务器地址填 `https://your-domain.com/api/audit/callback`
4. Token 填 `.env` 里的 `WX_CONTENT_SECURITY_TOKEN`
5. 保存时微信会发 GET 校验请求，接口已实现 `echostr` 回显，应提示"保存成功"
6. 消息加解密方式选「安全模式」时，把 EncodingAESKey 填到 `WX_CONTENT_SECURITY_AES_KEY`

**抖音小程序挂载直播/短视频**（PRD 第二十九节）：
小程序审核通过后，在巨量星图后台创建「小程序组件」，应用渠道选「直播」或「短视频」；
达人挂载门槛为有效粉丝 ≥ 1000、已实名认证且成年、近 3 个月无违规。

---

## 上线前检查

```bash
# 1. 全量类型与构建
pnpm typecheck
pnpm build

# 2. 后端全链路冒烟（指向生产地址）
node scripts/smoke-api.mjs https://your-domain.com

# 3. 安全检查
#    - JWT_SECRET 是否已改为随机值（.env）
#    - DB 端口是否未对公网开放
#    - /api/health 是否暴露了不该暴露的信息
#    - 对象存储凭证是否只在服务端（不要写进前端 env）
#    - 内容安全供应商是否已从 mock 切到真实（CONTENT_SECURITY_PROVIDER）
```

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `EADDRINUSE :::3100` | 已有实例在跑；`Get-NetTCPConnection -LocalPort 3100` 找到进程后结束，或换 `PORT=3111` |
| H5 打开白屏 | 检查 devServer 是否启动、`/api` 代理是否指向 3100 |
| 小程序里接口 404/网络错误 | 开发者工具需勾选「不校验合法域名」，或配置 `TARO_APP_API` 为 https 域名 |
| `pnpm install` 卡在二进制下载 | 仓库 `.npmrc` 已指向 npmmirror；如仍慢，调大 `fetch-timeout` |
| 后端图片不显示 | 演示图走 picsum CDN；离线环境会显示占位底色，不影响功能验证 |
