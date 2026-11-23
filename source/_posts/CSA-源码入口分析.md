---
title: CSA 源码入口分析
categories:
  - 学习笔记
tags: []
description: "这篇文章用于记录CSA学习的过程"
date: 2026-11-23 18:46:14
updated: 2026-11-23 18:46:14
---

# Clang Static Analyzer Checker 开发指南

## 1. CSA Checker 基础概念

Clang Static Analyzer（CSA）是 Clang 内置的路径敏感静态分析器，Checker 是 CSA 里一条独立的分析规则。

- 一个 Checker 对应一个独立名称（如 `core.BitwiseShift`），可以单独开启/关闭
- Checker 可以监听多种 AST 节点回调，在遍历 AST、符号执行的时候插入自定义检查逻辑
- 区分两套概念：
  1. **AST 回调（PreStmt / PostStmt）**：访问语法树节点时触发，适合语法、基础类型检查（移位检查就属于这类）
  2. **路径敏感回调（PreCall、eval::Call、check::Branch 等）**：符号执行、SVal、状态追踪，用于内存、泄漏、空指针这类跨路径分析

> 核心示例：`BitwiseShiftChecker`，专门检查移位操作带来的未定义行为 UB。

---

## 2. Checker 类基础写法 & 回调声明

### 2.1 继承 `Checker<...>` 模板

```cpp
class BitwiseShiftChecker : public Checker<check::PreStmt<BinaryOperator>> {
public:
  void checkPreStmt(const BinaryOperator *BO, CheckerContext &C) const;
};
```

- `Checker<>` 模板参数是**回调标签（marker tag）**，属于编译期元信息，不是运行时类型
- `check::PreStmt<BinaryOperator>`：声明该 checker 需要在**进入 BinaryOperator 节点前**收到回调
- 支持传入多个回调标签，一个 checker 可以同时监听多种节点：

```cpp
class MyChecker : public Checker<
    check::PreStmt<BinaryOperator>,
    check::PreStmt<CallExpr>,
    check::PreCall
> {
public:
  void checkPreStmt(const BinaryOperator*, CheckerContext&) const;
  void checkPreStmt(const CallExpr*, CheckerContext&) const;
  void checkPreCall(const CallExpr*, CheckerContext&) const;
};
```

- `check::PreStmt<T>` 含义：访问该 AST 节点**之前**回调；`check::PostStmt<T>`：访问完子节点之后回调
- 模板会自动生成 `isa`、`cast` 类型分发逻辑，不需要手写类型判断胶水代码（对比手写 `PreStmt` 模板）

### 2.2 手写胶水模板（老方式，等价于 `check::PreStmt<T>`）

对话中出现的 `PreStmt<STMT>` 是手动复刻 CSA 原生能力的样板代码：

```cpp
template <typename STMT>
class PreStmt {
  template <typename CHECKER>
  static void _checkStmt(void *checker, const Stmt *S, CheckerContext &C) {
    ((const CHECKER *)checker)->checkPreStmt(cast<STMT>(S), C);
  }
  static bool _handlesStmt(const Stmt *S) {
    return isa<STMT>(S);
  }
public:
  template <typename CHECKER>
  static void _register(CHECKER *checker, CheckerManager &mgr) {
    mgr._registerForPreStmt(CheckerManager::CheckStmtFunc(checker, _checkStmt<CHECKER>), _handlesStmt);
  }
};
```

- `STMT`：要监听的 AST 节点类型（`BinaryOperator` / `CallExpr`）
- `CHECKER`：你的检查器类
- 作用：手动注册回调、做类型过滤与转型；官方推荐直接使用 `check::PreStmt<T>`，不用手写这套胶水

---

## 3. Checker 注册机制（重点：区分「元信息登记」和「实例注册」）

### 3.1 两个注册入口模式

#### 模式 A：内置 Checker（编译进 Clang 本体，BitwiseShiftChecker 属于这类）

**1. `Checkers.td`（TableGen 文件）**

```tablegen
def BitwiseShiftChecker : Checker<"BitwiseShift">,
  HelpText<"Finds cases where bitwise shift operation causes undefined behaviour.">,
  CheckerOptions<[
    CmdLineOption<Boolean,
                  "Pedantic",
                  "If set to true, the checker reports undefined behavior even "
                  "if it is supported by most compilers. (This flag has no "
                  "effect in C++20 where these constructs are legal.)",
                  "false",
                  Released>,
  ]>,
  Documentation<HasDocumentation>;
```

- 路径：`llvm-project/clang/include/clang/StaticAnalyzer/Checkers/Checkers.td`
- 它**不是运行时读取的配置文件**，是编译期元描述文件
- `clang-tblgen` 工具读取 td 文件，生成 `BuiltinCheckerRegistration.inc` C++ 代码，硬编码进 clang 二进制
- 作用：定义 checker 名称、帮助文本、分组、CheckerOptions 配置项、文档标记
- `CheckerOptions`：声明该 checker 的可配置参数，对应命令行 `-analyzer-config core.BitwiseShift:Pedantic=true`
- **注意**：td 只负责**声明参数**，是否启用该分支告警，仍然由 C++ 代码读取参数后分支判断。

**2. C++ 注册函数（必须写，tblgen 会绑定名字和这个函数）**

```cpp
void ento::registerBitwiseShiftChecker(CheckerManager &mgr) {
  mgr.registerChecker<BitwiseShiftChecker>();
}
bool ento::shouldRegisterBitwiseShiftChecker(const CheckerManager &mgr) {
  return true;
}
```

- `ento::registerXXXChecker`：CSA 查找的入口函数
- `mgr.registerChecker<T>()`：实例化 checker，读取 `Checker<...>` 的回调标签，挂载回调到 CheckerManager

#### 模式 B：插件模式（编译为独立 .so，不用重新编译整个 clang）

- 不需要 `Checkers.td`
- 同样需要 `ento::registerXXXChecker` 函数
- 加载方式：`clang -cc1 -load libMyChecker.so -analyzer-checker=mygroup.MyChecker test.c`
- 短板：`-analyzer-checker-help` 不会自动展示插件 checker、配置项没有内置帮助文本

### 3.2 CSA 启动执行时序（非常关键）

1. **收集元信息清单**：内置 checker 来自 tblgen 生成表；插件 checker dlopen 后扫描符号表，收集全部 `registerXXXChecker` 函数指针、名字。

   > 这一步**不执行注册函数、不实例化 checker、不挂载回调**，只是一张清单。

2. **解析命令行开关**：解析 `-analyzer-checker=` / `-analyzer-disable-checker=`，得到启用集合。

3. **执行注册（仅启用的 checker）**：只对启用列表内的 checker 调用 `registerXXXChecker`，实例化、挂载回调；**未启用 checker 的注册函数完全不执行**。

   > 特例：core 基础 checker（除零、空指针、未初始化）有依赖标记，开启任意依赖 core 的 checker，会自动连带开启 core 基础 checker。

4. **开始分析**：遍历 AST / 符号执行，触发已经挂载的回调。

> 一句话：**清单是全量的；实例化、回调注册是按需的。**

---

## 4. 移位 UB 规则（BitwiseShiftChecker 业务逻辑）

移位 `E1 << E2` / `E1 >> E2`，统一约束：

> 若 `E2 < 0` 或者 `E2 >= E1` 的类型位宽 → **UB，有符号、无符号全部适用**（默认模式就检测这条）
>
> `Pedantic=true` 开启额外严格检查（pedantic 模式才触发）

| 场景                    | C / C++17                                  | C++20                        |
| ----------------------- | ------------------------------------------ | ---------------------------- |
| 有符号负数左移 `a << n` | UB                                         | UB                           |
| 有符号负数右移 `a >> n` | UB（编译器普遍实现算术右移，但标准不保证） | 良定义：算术右移（补符号位） |
| 无符号移位溢出          | 良定义，模 2^N 回绕                        | 良定义                       |
| 有符号正数左移溢出      | UB                                         | UB                           |

- 无符号移位：**只有移位次数非法才 UB，溢出不是 UB，不存在符号相关 UB**
- `Pedantic=true` 作用：在 C/C++17 下，对负数右移告警；C++20 下该选项失效，不再告警
- 不存在独立的 "算术右移运算符"，C/C++ 只有一个 `>>`，行为由类型 + C++ 标准版本决定

> 如果想要可移植、无 UB 的算术右移，需要手动用无符号类型实现，不能直接依赖 `a >> b`。

---

## 5. 工厂单例、Tag 类型标记、unique_ptr 所有权模型

对话里出现的简易 checker 工厂代码：

```cpp
template <typename T>
static void *getTag() { static int tag; return &tag; }

template <typename CHECKER, typename... AT>
CHECKER *getChecker(AT &&...Args) {
  CheckerTag Tag = getTag<CHECKER>();
  std::unique_ptr<CheckerBackend> &Ref = CheckerTags[Tag];
  if (!Ref) {
    std::unique_ptr<CHECKER> Checker =
        std::make_unique<CHECKER>(std::forward<AT>(Args)...);
    CHECKER::_register(Checker.get(), *this);
    Ref = std::move(Checker);
  }
  return static_cast<CHECKER *>(Ref.get());
}
```

### 5.1 `getTag<T>` 原理

- 模板函数，不同模板参数 T 生成独立函数实例；每个实例内部 `static int tag` 是该实例独有的静态局部变量
- 返回静态变量地址，**作为类型唯一 key**
- 用途：关闭 RTTI（`-fno-rtti`，LLVM 默认）环境下，替代 `typeid` 做类型区分
- 特性：同一个类型多次调用返回同一个地址；不同类型地址不同；static 变量第一次调用时初始化，程序生命周期内地址固定

### 5.2 `unique_ptr` 的作用（为什么不直接裸指针）

- `unique_ptr`：独占所有权智能指针，零开销，LLVM 大量使用
- 这里容器 `CheckerTags` 里面存 `unique_ptr<CheckerBackend>`：**容器持有 checker 对象所有权**
- 当管理类析构 → map 析构 → map 内每个 unique_ptr 析构 → 自动 delete checker，避免内存泄漏
- 返回裸指针只是**借用访问权（borrow pointer）**，调用方禁止 delete，不能在管理对象销毁后继续使用
- 对比裸指针方案：裸指针功能可以跑，但需要手动写析构循环逐个 delete，容易泄漏；shared_ptr 有引用计数开销，不需要

> 所有权和访问权分离：`unique_ptr` 管生命，裸指针用来调用。

---

## 6. 重要易错点汇总

1. 继承 `Checker<...>` 只是声明回调能力，**不会自动注册**，必须写 `ento::registerXXXChecker`
2. `Checkers.td` 是编译期元数据，运行时 CSA 不会读取 td 文件
3. `Pedantic` 配置项只是开关告警分支，不会改变 C++ 标准本身的移位语义
4. 负数左移在 C++20 依旧是 UB；负数右移 C++20 才良定义为算术右移
5. 无符号移位溢出不是 UB，移位次数非法才是 UB
6. 插件模式没有 `Checkers.td`，配置项可以读但是没有自动帮助文档
7. 类型 tag 方案只区分类型，天然是每个 checker 类型单例，不能一个类型多个实例
8. 裸指针借用模式风险：调用方长期保存返回裸指针，父容器销毁后会变成野指针

---

## 7. 常用配套 API 补充

- `isa<T>(S)`：运行时判断 Stmt 是否是 T 类型
- `cast<T>(S)`：安全向下转型（前提 isa 判断通过）
- `dyn_cast<T>(S)`：安全转型，失败返回 nullptr
- `CheckerContext`：当前分析上下文，获取 AST、SVal、报告告警、读取 checker 配置项
- `getCheckerBooleanOption`：读取 CheckerOptions 里的布尔配置（如 `Pedantic`）
