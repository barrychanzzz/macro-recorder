# MacroRecorder

<p align="center">
  <strong>键盘鼠标操作录制与回放工具</strong> — 基于 Electron + React + TypeScript
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-41.x-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/React-19.x-61DAFB?logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Platform-macOS--Windows--Linux-lightgrey" alt="Cross-platform">
</p>

## ✨ 功能特性

- 🎯 **全局输入捕获** — 通过 `uiohook-napi` 在系统级别录制键盘和鼠标事件，即使应用在后台也能工作
- ⚡ **高精度回放** — 使用 `performance.now()` 绝对时间戳调度，亚毫秒级精度，无漂移
- 🎮 **多键同时录制** — 支持游戏组合键（如 W+A 斜向移动），每键独立追踪
- ✋ **长按/短按区分** — 自动识别长按（≥200ms），回放时保持原始持续时间
- 🖱️ **鼠标按钮智能识别** — 自动标准化触控板/鼠标按键（左键、中键、右键）
- 🔁 **循环播放** — 支持单次或无限循环回放，可调循环间隔
- 💾 **宏管理** — 保存、加载、删除录制的宏（JSON 格式）
- ⌨️ **全局快捷键** — `Ctrl+Shift+R` 录制 / `Ctrl+Shift+P` 回放
- 🎛️ **灵敏度调节** — 可自定义鼠标点击去重阈值和移动节流间隔

## 🏗️ 技术架构

```
macro-recorder/
├── electron/              # Electron 主进程
│   ├── main.ts           # 核心后端：uiohook 捕获 + robotjs 回放引擎
│   └── preload.js        # IPC 安全桥接
├── src/                   # React 前端 (Vite)
│   ├── App.tsx           # 主应用组件
│   ├── components/       # UI 组件
│   │   ├── Header.tsx
│   │   ├── ControlBar.tsx
│   │   ├── EventList.tsx
│   │   ├── SavedMacros.tsx
│   │   └── MacroSettingsPanel.tsx
│   └── types/index.ts    # TypeScript 类型定义
├── package.json
├── tsconfig.json          # 前端 TS 配置
├── tsconfig.electron.json # Electron 端 TS 配置
└── vite.config.ts         # Vite 构建配置
```

### 核心依赖

| 用途 | 技术 | 说明 |
|------|------|------|
| 全局输入捕获 | [uiohook-napi](https://www.npmjs.com/package/uiohook-napi) | 跨平台键盘鼠标钩子 |
| 输入模拟 | [robotjs](https://www.npmjs.com/package/robotjs) | 跨平台键盘鼠标模拟 |
| 桌面应用框架 | [Electron](https://www.electronjs.org/) | 跨平台桌面应用壳 |
| 前端框架 | React 19 + TypeScript | UI 渲染层 |
| 前端构建 | Vite 8 | 快速开发服务器 |

### 关键设计决策

1. **KeyPressState 追踪架构** — 使用 `Map<number, KeyPressState>` 对每个按键独立追踪生命周期（首次按下 → OS 重复过滤 → 释放时计算持续时间）
2. **绝对时间戳回放** — 不使用相对 delay 累加（会漂移），改为基于 `performance.now()` 的绝对调度偏移量
3. **keyToggle 替代 keyTap** — 回放时使用 `keyToggle('down'/'up')` 配对，支持多键同时按住和精确的持续时间控制
4. **按钮名称标准化** — 在捕获时刻将 uiohook 的数字编号转为 `'left'|'middle'|'right'` 字符串，下游代码无需关心编码差异

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- npm 或 pnpm
- macOS / Windows / Linux

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/barrychanzzz/macro-recorder.git
cd macro-recorder

# 安装依赖
npm install

# 编译 Electron 主进程（重要！每次修改 electron/main.ts 后需执行）
npx tsc -p tsconfig.electron.json

# 启动开发模式
npm run dev

# 或者打包生产版本
npm run build && npm run package:mac     # macOS
npm run build && npm run package:win     # Windows
```

### 开发注意事项

> ⚠️ **重要**：修改 `electron/main.ts` 后必须重新编译：
> ```bash
> npx tsc -p tsconfig.electron.json
> ```
> 因为 `npm run dev` 只运行 Vite（前端）+ Electron，不会自动编译 Electron 端 TypeScript。

## 📖 使用指南

1. **开始录制** — 点击「开始录制」按钮或按 `Ctrl+Shift+R`
2. **执行操作** — 执行你想自动化的键盘鼠标操作（支持后台录制）
3. **停止录制** — 再次按快捷键或点击「停止录制」
4. **回放** — 点击「回放」或按 `Ctrl+Shift+P`
5. **保存宏** — 为常用操作命名保存，下次直接加载使用

### 全局快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+R` | 开始 / 停止录制 |
| `Ctrl+Shift+P` | 开始 / 停止回放 |

## 🎮 典型用例

- **游戏自动化** — 录制连招序列、重复操作（支持多键组合）
- **办公效率** — 自动化重复性的表格填写、数据录入
- **测试脚本** — 录制 UI 操作流程用于回归测试
- **直播辅助** — 连续点赞、弹幕发送等高频操作

## 📄 License

MIT License © 2026 Barry Chan
