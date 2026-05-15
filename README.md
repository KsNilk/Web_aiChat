# Web_aiChat

一个纯前端实现的 DeepSeek API 聊天应用，支持流式响应、多会话管理、Token 用量估算、自定义规则与配置导入导出。

## 功能特性

- 流式对话：通过 SSE 流实时显示回答，支持打字动效与停止生成。
- 双模型支持：切换 flash（快速）与 pro（专业）模式，自带价格计算。
- 深度思考：Pro 模式下可开启思考过程展示，区分思考与回答（【思考】/【回答】 标记）。
- 会话管理：创建、删除、切换对话，消息自动保存至浏览器本地存储。
- Markdown 渲染：支持代码块（语言检测、一键复制）、行内代码、加粗文本。
- Token 与费用估算：实时统计输入/输出 Token 数及预估费用（基于模型单价）。
- 自定义规则：添加系统级 Prompt 强制约束（如代码块格式要求）。
- 配置 Im/Export：以 YAML 格式导出/导入全部配置（API Key、温度、模式、规则、用量等）。
- 快捷键支持：Enter 发送，Shift+Enter 换行，Esc 关闭弹窗。
- 安全展示：API Key 输入框可切换密码显示。

## 使用方式

1. 获取 [DeepSeek API Key](https://platform.deepseek.com)
2. 打开页面 → 点击齿轮图标配置 API Key 和温度
3. 选择模型模式，开启深度思考（Pro 适用）
4. 开始对话，程序自动流式输出并记录用量

## 技术栈

- 原生 JavaScript（ES5 兼容，无框架依赖）
- 浏览器 localStorage 持久化
- Fetch API + ReadableStream 流式处理
- YAML 解析与生成（手写轻量实现）

> 注意：所有数据仅保存在本地浏览器中，API 请求直接由前端发往 DeepSeek。
