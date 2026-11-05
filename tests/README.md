# 原型验证

从工程根目录执行 `npm run check`、`npm run lint`、`npm test`；启动 `npm start` 后执行 `npm run test:browser`。

- `core.test.mjs`：目标能力、互斥与重试、IP 范围、型号烧录映射、LED/老化、CTFP 篡改与边界。
- `browser.mjs`：真实文件选择、Excel 表结构与 SN 分配、搜索校验、表单保留、型号页面、版本入口、人工确认、方案导入与老化停止。
- `qt514-profile.ctfp`：独立 Qt 5.14 QDataStream 生成明文，经 Node AES-256-GCM 封装的固定夹具；包含三个阶段和六类参数。另已用 Windows Qt 5.14 读取 JavaScript 输出的明文，校验字段与流结束位置。

这些测试只验证原型逻辑；不连接真实控制器，不证明驱动、云服务或烧录正常。
