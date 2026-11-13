# Ticket Desk 工单工作台

基于 React 的客户端单页应用，为 Ticket Desk 工单系统提供登录、工单、评论、分类和管理员用户管理界面。技术栈为 React、TypeScript、Vite、React Router、TanStack Query 和 Tailwind CSS，不使用服务端渲染，也不增加独立前端后端。

## 环境要求

- Node.js 22.18 or newer
- pnpm

## 命令

在仓库根目录安装依赖，然后可在根目录通过 workspace filter 启动前端：

```bash
pnpm install
pnpm --filter ticket-desk-webapp dev
pnpm --filter ticket-desk-webapp run build
pnpm --filter ticket-desk-webapp preview
```

开发服务器会将 `/api/*` 和 `/health` 代理至 `http://localhost:3000`。如需使用其他后端地址，可在本地 `.env` 文件中设置 `VITE_API_PROXY_TARGET`；该地址必须能被 Vite 开发服务器访问。

后端需在仓库根目录单独运行 `pnpm dev`。如果后端端口回退到 3000 以外的端口，请将 `VITE_API_PROXY_TARGET` 配置为实际地址。

## 当前页面

- `/login`：账户登录。
- `/tickets`：工单筛选、分页和列表。
- `/tickets/new`：新建工单。
- `/tickets/:id`：工单详情、状态操作、分配和评论。
- `/categories`：分类查询；管理员可创建和修改。
- `/users`：管理员用户管理。

## 源码目录

- `src/main.tsx` 与 `src/App.tsx`：应用入口、路由和全局 provider。
- `src/views/`：按业务域组织的路由页面；工单、用户、分类页面各自拆分。
- `src/components/`：跨页面共享组件和业务组件，按 `common/`、`layout/`、`tickets/`、`users/`、`categories/` 分类。
- `src/hooks/`：React hooks 与认证状态 Provider。
- `src/services/`：API 客户端及请求类型。
- 样式直接以内联 `<style>` 内容维护在对应 TSX 中：通用规则位于 `components/common/GlobalStyles.tsx`，工作台布局位于 `components/layout/AppShell.tsx`，工单样式位于 `components/tickets/TicketBadges.tsx`，登录和 404 样式分别位于对应页面组件中；不再使用独立 CSS 文件。

页面 View 负责数据请求和页面级状态；表单等组件接收数据与回调，负责局部交互和展示。

会话令牌仅保存在当前页面内存中。刷新页面会回到登录页；跨页面刷新持久化策略尚待产品决策。前端依赖后端完成最终身份校验和权限控制。
