# 业务数字孪生 — 全量实施提示词

> 将此提示词复制给另一个 Claude Code session 执行。项目路径：`D:\group\group-platform`

## 项目背景

这是一个工程建筑+充电站+财务的企业管理平台（group-platform），后端 FastAPI + PostgreSQL + asyncpg，前端 React 19 + Vite + shadcn/ui + TanStack Query + Zustand。

已有一个 agent 自进化系统（`backend/app/services/agent_evo/`），包含：Agent注册/执行/进化、Hook生命周期、Letta三层记忆、DAG工作流引擎、Token优化、Guardrails校验。

AI网关（`backend/app/services/ai_gateway.py`）支持多provider路由：GLM-5.1（中文业务）、Gemma 4 26B本地（辅助任务隧道）、DeepSeek V4 Pro（深度推理）。

**终极目标：** 在云端构建业务数字孪生 — 重现所有业务操作、预测未来趋势、What-if模拟决策。

## 技术栈约束

- 后端：Python 3.12+, FastAPI, SQLAlchemy async, PostgreSQL（已有pgvector扩展）, asyncio
- 前端：React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS v4, TanStack Query 5, Zustand 5, Recharts 3, @xyflow/react 12
- AI：智谱(glm-5.1/glm-4-flash), DeepSeek(deepseek-chat/deepseek-reasoner), 本地Ollama(gemma4:26b)
- 新增Python包可以引入，但需要写入 requirements.txt
- 前端新增包也可以引入
- 所有新表用 `evo_` 或 `biz_` 前缀，继承 `TenantBase`（路径 `app.models.base.model_base.TenantBase`）
- 所有API路由挂载到 `app/api/v1/` 下，在 `app/api/v1/__init__.py` 或 main.py 注册
- 前端路由在 `frontend/src/router.tsx` 注册，导航在 `frontend/src/layouts/AppLayout.tsx` 添加
- 依赖注入：`get_current_user: User = Depends(get_current_user)`, `db: AsyncSession = Depends(get_db)`
- API客户端：前端用 `import { get, post, put, del } from '@/lib/http'`

## 关键文件路径

```
后端：
  app/core/ai.py                          — AI provider配置（PROVIDERS dict）
  app/core/config.py                       — 数据库/Redis/MinIO配置
  app/core/database.py                     — SQLAlchemy async engine
  app/models/base/model_base.py            — TenantBase基类
  app/models/agent_evolution/models.py     — 11张evo_表
  app/services/ai_gateway.py               — AI网关（provider/tunnel_chat/routed_chat）
  app/services/ai_prediction_service.py    — 现有预测服务（需重写）
  app/api/v1/predictions/router.py         — 现有预测API（需重写）
  app/services/agent_evo/                  — Agent进化系统（lifecycle/hooks/workflow/evolution/memory）
  app/services/intelligence/               — 智能引擎（规则/知识库/告警）
  app/services/autopilot/                  — 自动驾驶（仪表盘/告警引擎/报告/学习）

前端：
  frontend/src/router.tsx                  — 路由注册
  frontend/src/layouts/AppLayout.tsx       — 导航布局
  frontend/src/api/agent-evolution.ts      — Agent进化API客户端
  frontend/src/api/analytics.ts            — 分析API客户端
  frontend/src/api/intelligence.ts         — 智能引擎API客户端
  frontend/src/pages/agent-evolution/      — 5个现有页面
  frontend/src/pages/dashboard/            — 现有仪表盘
```

---

# Phase 0: 修复现有 Bug（先做）

## Bug 1: lifecycle.py agent None 检查顺序

文件：`backend/app/services/agent_evo/lifecycle.py`

在 `execute_agent` 方法中，约 line 68-78：
```python
agent = (await db.execute(
    select(EvoAgent).where(EvoAgent.id == agent_id)
)).scalar_one_or_none()

if not agent:
    raise ValueError(f"Agent {agent_id} 不存在")

if agent.status == "disabled":
    raise ValueError(f"Agent「{agent.name}」已禁用，请先启用后再执行")

agent.execution_count = (agent.execution_count or 0) + 1
```

**问题**：`execution_count` 递增在 `agent` None检查之后，但现在代码已经是修复后的顺序。验证一下是否正确，如果 `agent.execution_count` 递增在检查之前，就移到之后。

## Bug 2: prompt_evolver.py Level 2 tools 类型

文件：`backend/app/services/agent_evo/evolution/prompt_evolver.py`

`apply_evolution` 方法中，Level 2 进化把 `history.new_content`（str）赋给 `agent.tools`（JSONB）。

**修复**：在赋值前加 JSON 解析：
```python
if level == 2:
    import json
    try:
        agent.tools = json.loads(history.new_content) if isinstance(history.new_content, str) else history.new_content
    except (json.JSONDecodeError, TypeError):
        agent.tools = history.new_content
```

## Bug 3: engine.py final_node 逻辑

文件：`backend/app/services/agent_evo/workflow/engine.py`

约 line 203，收集最终输出的逻辑。当前代码应该是：
```python
# 收集最终输出 — 取DAG的sink节点（无出边的节点）
sink_node_ids = set(n["id"] for n in nodes)
for edge in edges:
    sink_node_ids.discard(edge["source"])
```

确认这段代码是否已修复（取无出边的sink节点而不是 `nodes[-1]`）。如果没有，替换为上面的逻辑。

---

# Phase 1: 数据整合层（2周）

## 1.1 新建统一业务视图模型

文件：`backend/app/models/business/models.py`（新建）

```python
"""业务数字孪生 — 统一数据模型"""

class BizEvent(TenantBase):
    """业务事件流 — 所有业务变更的统一记录"""
    __tablename__ = "biz_events"

    event_type: str          # contract_signed / project_created / payment_made / invoice_received / ...
    source_module: str       # erp / project / finance / charging / crm
    source_id: str           # 原始记录ID
    event_data: dict         # 完整事件数据（JSONB）
    event_date: datetime     # 事件发生时间
    amount: float | None     # 关联金额（方便聚合查询）
    entity_ids: list | None  # 关联实体ID列表（公司/项目/合同/供应商）


class BizEntity(TenantBase):
    """业务实体 — 统一管理公司/项目/合同/供应商/客户等实体"""
    __tablename__ = "biz_entities"

    entity_type: str         # company / project / contract / supplier / customer / station
    entity_name: str
    source_id: str           # 原始系统中的ID
    properties: dict         # 实体属性（JSONB）
    status: str              # active / completed / terminated
    tags: list | None


class BizRelation(TenantBase):
    """业务实体关系 — 知识图谱的边"""
    __tablename__ = "biz_relations"

    source_entity_id: str    # FK to biz_entities.id
    target_entity_id: str    # FK to biz_entities.id
    relation_type: str       # supplies / contracts_with / pays / belongs_to / ...
    properties: dict | None  # 关系属性（金额、日期等）
    valid_from: datetime | None
    valid_to: datetime | None
    confidence: float        # 置信度


class BizMetric(TenantBase):
    """业务指标快照 — 每日/每周/每月聚合"""
    __tablename__ = "biz_metrics"

    metric_type: str         # revenue / cost / cash_flow / project_count / ...
    period: str              # 2026-01 / 2026-Q1 / 2026
    period_type: str         # daily / weekly / monthly / quarterly / yearly
    value: float
    dimensions: dict | None  # 分维度（按业务线、按项目类型等）
```

## 1.2 事件采集器

文件：`backend/app/services/business_digital_twin/event_collector.py`（新建）

功能：
- 提供 `emit_event(db, company_id, event_type, source_module, source_id, event_data, amount, entity_ids)` 异步方法
- 写入 `biz_events` 表
- 同时提取/更新 `biz_entities` 和 `biz_relations`（调用 knowledge_graph 的三元组提取）
- 提供 `replay_events(db, company_id, start_date, end_date)` 方法回放历史事件（用于"重现"）

## 1.3 现有模块接入事件总线

在以下模块的关键操作后调用 `emit_event`：
- `app/services/erp/` — 合同创建/签约/变更
- `app/services/project/` — 项目创建/状态变更
- `app/services/finance/` — 收付款/银行流水
- `app/services/charging/` — 充电订单/收入
- `app/services/petty_cash/` — 备用金核销

每个模块只加一行 `await emit_event(...)` 调用，不改动原有逻辑。

## 1.4 数据聚合定时任务

文件：`backend/app/services/business_digital_twin/metric_aggregator.py`（新建）

功能：
- `aggregate_daily(db, company_id, date)` — 聚合当日指标
- `aggregate_monthly(db, company_id, year, month)` — 聚合当月指标
- 指标包括：收入、成本、净利润、合同数、项目数、回款率、充电收入、充电量
- 按 `period_type` 写入 `biz_metrics`

用 APScheduler 注册定时任务（每天凌晨跑前一天的聚合）。

文件：`backend/app/tasks/scheduler.py`（新建或修改已有的）
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

async def daily_aggregate():
    # 遍历所有 company，跑前一天聚合
    ...

scheduler.add_job(daily_aggregate, 'cron', hour=2, minute=0)
```

在 FastAPI startup event 中启动 scheduler。

## 1.5 新API

文件：`backend/app/api/v1/business_twin/router.py`（新建）

端点：
```
GET  /business-twin/events          — 查询事件流（支持时间范围、类型筛选）
GET  /business-twin/entities         — 查询业务实体（支持类型筛选、搜索）
GET  /business-twin/relations        — 查询实体关系（知识图谱数据）
GET  /business-twin/metrics          — 查询聚合指标（支持period_type、metric_type筛选）
POST /business-twin/replay           — 回放指定时间段的业务事件（重现）
GET  /business-twin/timeline         — 时间轴视图（按日期排列的关键业务事件）
```

## 1.6 前端 — 业务时间轴页面

文件：`frontend/src/pages/business-twin/BusinessTimeline.tsx`（新建）

功能：
- 时间轴展示关键业务事件（合同签约、项目开工、大额收付款）
- 按月/季切换视图
- 点击事件查看详情
- 支持搜索和筛选（按事件类型、金额范围）

文件：`frontend/src/api/business-twin.ts`（新建）

---

# Phase 2: 知识图谱 + 理解层（3周）

## 2.1 扩展知识图谱到全业务

文件：`backend/app/services/business_digital_twin/knowledge_graph.py`（新建）

基于现有的 `agent_evo/memory/knowledge_graph.py` 模式扩展：

功能：
- `extract_from_document(db, company_id, doc_type, doc_text)` — 从业务文档提取实体关系
- `build_graph(db, company_id)` — 从所有 biz_entities + biz_relations 构建完整图谱
- `query_graph(db, company_id, entity_name, depth=2)` — 查询某实体的关联网络
- `find_path(db, company_id, from_entity, to_entity)` — 两个实体间的关系路径
- `get_entity_profile(db, company_id, entity_name)` — 实体360度画像（关联项目、合同、金额、风险）

三元组提取的LLM调用走 `ai_gateway.routed_chat(task="memory_extract")` 走本地Gemma。

## 2.2 知识图谱可视化API

文件：`backend/app/api/v1/business_twin/router.py`（追加）

```
GET  /business-twin/graph              — 获取图谱数据（nodes + edges，供前端D3渲染）
GET  /business-twin/graph/entity/:name — 实体详情+关联
GET  /business-twin/graph/path         — 两实体间路径查询
GET  /business-twin/graph/profile/:id  — 实体360画像
```

## 2.3 前端 — 知识图谱页面

文件：`frontend/src/pages/business-twin/KnowledgeGraph.tsx`（新建）

需要安装：`npm install @antv/g6`（蚂蚁的图可视化库，中文文档完善）

功能：
- 力导向图展示业务实体关系
- 节点按类型着色（公司=蓝、项目=绿、合同=橙、供应商=紫）
- 点击节点展开关联、显示详情面板
- 搜索实体、高亮路径
- 右侧面板显示实体360画像

## 2.4 Agent 记忆系统增强

文件：`backend/app/services/agent_evo/memory/manager.py`（修改）

增加：
- **记忆衰减**：`_retrieve_memories` 里加 `effective_score = m.score * 0.98 ** days_since(m.last_used_at or m.created_at)`
- **记忆去重**：`add_archival` 前检查 `content_embedding` 余弦相似度 > 0.95 → 合并而不是新增
- **Embedding 生成服务**：文件 `backend/app/services/embedding_service.py`（新建），调用智谱的 embedding API 或本地 text2vec

---

# Phase 3: 预测引擎（3周）

## 3.1 安装 Prophet

```
pip install prophet pandas numpy
```

写入 `backend/requirements.txt`。

## 3.2 重写预测服务

文件：`backend/app/services/business_digital_twin/prediction_engine.py`（新建）

完全重写 `ai_prediction_service.py` 的逻辑，但保留原有API兼容。

```python
class PredictionEngine:
    """基于Prophet的时序预测引擎"""

    async def _get_monthly_series(self, db, company_id, metric_type, months=24):
        """从biz_metrics获取月度时序数据"""
        ...

    def _fit_prophet(self, series_df, periods=6):
        """训练Prophet模型并预测"""
        from prophet import Prophet
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            changepoint_prior_scale=0.05,
        )
        model.fit(series_df)
        future = model.make_future_dataframe(periods=periods, freq='M')
        forecast = model.predict(future)
        return forecast

    async def predict_revenue(self, db, company_id, months_ahead=6):
        """收入预测 — 基于历史合同签约+项目完成"""
        series = await self._get_monthly_series(db, company_id, 'revenue')
        if len(series) < 6:
            # 数据不足，降级为简单外推
            return self._simple_forecast(series, months_ahead, 'revenue')
        forecast = self._fit_prophet(series, months_ahead)
        return self._format_forecast(forecast, months_ahead, 'revenue')

    async def predict_cost(self, db, company_id, months_ahead=6):
        """成本预测"""
        ...

    async def predict_cash_flow(self, db, company_id, months_ahead=6):
        """现金流预测 — 结合收入、成本、应收应付账龄"""
        revenue = await self.predict_revenue(db, company_id, months_ahead)
        cost = await self.predict_cost(db, company_id, months_ahead)
        # 加上应收应付的账龄分析
        ar_aging = await self._get_ar_aging(db, company_id)
        ap_aging = await self._get_ap_aging(db, company_id)
        # 综合计算
        ...

    async def predict_project_risk(self, db, company_id):
        """项目风险预测 — 基于历史项目延期率、成本超支率"""
        ...

    def _simple_forecast(self, series, periods, metric_type):
        """数据不足时的降级策略"""
        ...

    def _format_forecast(self, forecast, periods, metric_type):
        """格式化Prophet输出为API响应"""
        ...
```

## 3.3 替换现有预测API

文件：`backend/app/api/v1/predictions/router.py`（重写）

保留现有端点路径不变，内部改为调用新的 `PredictionEngine`：

```
GET /predictions/revenue       → prediction_engine.predict_revenue
GET /predictions/cost          → prediction_engine.predict_cost
GET /predictions/cash-flow     → prediction_engine.predict_cash_flow
GET /predictions/project-risk  → prediction_engine.predict_project_risk（新端点）
GET /predictions/dashboard     → 综合视图（重写，加入Prophet的置信区间）
```

## 3.4 前端 — 预测仪表盘

文件：`frontend/src/pages/business-twin/PredictionDashboard.tsx`（新建）

功能：
- 收入/成本/现金流三线折线图（历史+预测，预测部分用虚线+置信区间阴影）
- 风险评分卡片（红/黄/绿）
- 项目风险列表（延期概率最高的项目）
- 月度/季度/年度切换
- 预测置信度展示

API客户端：`frontend/src/api/predictions.ts`（新建或扩展）

---

# Phase 4: 模拟沙盘（3周）

## 4.1 What-If 模拟引擎

文件：`backend/app/services/business_digital_twin/simulation_engine.py`（新建）

```python
class SimulationEngine:
    """What-If 模拟引擎"""

    async def simulate_scenario(
        self, db, company_id, scenario: dict,
    ) -> dict:
        """
        scenario 示例：
        {
            "name": "接500万新项目",
            "assumptions": {
                "new_project_budget": 5000000,
                "project_duration_months": 6,
                "payment_terms": "3-3-3-1",  # 分期比例
                "material_cost_increase": 0.05,  # 材料涨5%
            },
            "time_horizon_months": 12,
        }
        """
        # 1. 获取基准预测（不做任何变更时的预测）
        baseline = await prediction_engine.predict_cash_flow(db, company_id, 12)

        # 2. 叠加假设条件，重新计算
        simulated = self._apply_assumptions(baseline, scenario)

        # 3. 对比分析
        comparison = self._compare(baseline, simulated)

        # 4. 用LLM生成自然语言解读
        explanation = await self._explain_scenario(comparison, scenario)

        return {
            "baseline": baseline,
            "simulated": simulated,
            "comparison": comparison,
            "explanation": explanation,
            "risk_assessment": self._assess_risk(comparison),
        }

    async def _explain_scenario(self, comparison, scenario):
        """用DeepSeek解释模拟结果"""
        from app.services.ai_gateway import ai_gateway
        prompt = (
            f"基于以下业务模拟结果，给出简洁的决策建议：\n\n"
            f"场景：{scenario['name']}\n"
            f"假设：{scenario.get('assumptions', {})}\n"
            f"模拟结果：{comparison}\n\n"
            f"从现金流、风险、机会三个维度分析。不超过200字。"
        )
        return await ai_gateway.routed_chat(
            [{"role": "user", "content": prompt}],
            task="evolution_eval",
        )
```

## 4.2 模拟API

文件：`backend/app/api/v1/business_twin/router.py`（追加）

```
POST /business-twin/simulate           — 运行What-If模拟
GET  /business-twin/simulations        — 列出历史模拟记录
GET  /business-twin/simulations/:id    — 查看模拟详情
```

## 4.3 预置模拟模板

提供几个常用场景模板：
1. "接新项目" — 输入项目金额、工期、付款方式 → 预测对现金流的影响
2. "材料涨价" — 输入涨幅 → 预测对成本利润的影响
3. "客户回款延迟" — 输入延迟月数 → 预测资金链风险
4. "充电站扩容" — 输入新站点数 → 预测收入增长

## 4.4 前端 — 模拟沙盘页面

文件：`frontend/src/pages/business-twin/SimulationSandbox.tsx`（新建）

功能：
- 左侧：场景参数面板（表单输入假设条件，或选择预置模板）
- 右侧上：对比折线图（baseline vs simulated，双线+差异区域填充）
- 右侧下：AI解读文字 + 风险评分
- 底部：历史模拟列表（可对比不同场景的结果）

---

# Phase 5: 自然语言交互 + 前端完善（2周）

## 5.1 业务问答Agent

文件：`backend/app/services/business_digital_twin/nl_query.py`（新建）

```python
class BusinessNLQuery:
    """自然语言业务查询"""

    async def query(self, db, company_id, user_id, question: str) -> dict:
        """
        用户提问示例：
        - "上个月工程项目利润率怎么样？"
        - "应收账款有多少即将逾期？"
        - "今年充电站收入趋势如何？"
        - "如果接下XX项目，资金够吗？"
        """
        # 1. 意图识别（用LLM分类）
        intent = await self._classify_intent(question)

        # 2. 根据意图调用对应服务
        if intent == "metric_query":
            result = await self._query_metrics(db, company_id, question)
        elif intent == "prediction_query":
            result = await prediction_engine.predict_cash_flow(db, company_id)
        elif intent == "simulation_query":
            result = await simulation_engine.simulate_scenario(db, company_id, ...)
        elif intent == "entity_query":
            result = await knowledge_graph.get_entity_profile(db, company_id, ...)
        else:
            result = await self._general_qa(db, company_id, question)

        # 3. LLM生成自然语言回答
        answer = await self._generate_answer(question, result)
        return {"question": question, "answer": answer, "data": result, "intent": intent}
```

## 5.2 问答API

```
POST /business-twin/ask               — 自然语言问答
```

## 5.3 前端 — AI对话界面

文件：`frontend/src/pages/business-twin/AIAssistant.tsx`（新建）

功能：
- 对话式UI（类似ChatGPT界面）
- 用户输入自然语言问题
- 显示AI回答 + 相关数据图表
- 支持追问（上下文连续对话）
- 历史对话记录

## 5.4 现有Agent进化前端改进

### EvolutionDashboard 改进

文件：`frontend/src/pages/agent-evolution/EvolutionDashboard.tsx`（修改）

- 修复 `selectedAgent!` 非空断言 → 加条件判断
- 加搜索/筛选Agent列表
- 加全局统计卡片（总执行次数、平均质量、进化成功率）
- quality_trend 图加面积图（成功/失败占比）
- apply/rollback 操作加确认弹窗（用 AlertDialog）

### AgentDetailPage 改进

文件：`frontend/src/pages/agent-evolution/AgentDetailPage.tsx`（修改）

- 修复 `history.map((h: any) => ...)` → 定义 `EvolutionHistoryItem` 类型
- 执行结果显示详细输出（不只是toast）
- system_prompt 支持在线编辑（Textarea + 保存按钮）
- 加执行历史列表（调用 `executeAgent` 的记录）
- 加"对比测试"按钮：同一输入，跑老prompt vs 新prompt，并排显示

### WorkflowEditor 改进

文件：`frontend/src/pages/agent-evolution/WorkflowEditor.tsx`（修改）

- 新增节点类型：条件分支节点（diamond形状）、合并节点
- 边上加数据流标注（`edge.label = field_mapping`）
- 加撤销/重做（维护 history 栈）
- 加"试运行"按钮（只跑不保存，显示中间结果）
- 加模板库弹窗（从预设工作流快速创建）
- 节点连线校验（不能形成环、必需输入不能为空）

### WorkflowListPage 改进

文件：`frontend/src/pages/agent-evolution/WorkflowListPage.tsx`（修改）

- 显示 fitness_score（进度条或数字）
- 加工作流执行历史（可展开查看每次执行的节点状态）
- 加版本对比（两个版本的DAG diff）

### EvolutionApprovals 改进

文件：`frontend/src/pages/agent-evolution/EvolutionApprovals.tsx`（修改）

- 加 diff 视图（old_content vs new_content，高亮差异，用 `react-diff-viewer`）
- 加风险提示（这个进化会影响哪些场景的质量）
- 加批量审批（checkbox + 批量apply）
- 加拒绝原因输入框

### 新建 Hook 管理页面

文件：`frontend/src/pages/agent-evolution/HookManagement.tsx`（新建）

功能：
- 列出所有hooks（表格：名称、类型、优先级、启用状态）
- 开关切换启用/禁用
- 编辑 hook 配置（quality_gate 的 threshold 等）

### 新建数据集管理页面

文件：`frontend/src/pages/agent-evolution/DatasetManagement.tsx`（新建）

功能：
- 列出评估数据集
- 触发从执行历史构建 / LLM合成
- 查看数据集中的测试用例

### 新建工作流监控页面

文件：`frontend/src/pages/agent-evolution/WorkflowMonitor.tsx`（新建）

功能：
- 列出工作流执行实例（状态、耗时、成功/失败）
- 点击实例查看节点执行详情（每个节点的输入/输出/耗时）
- 节点状态颜色编码（pending=灰, running=蓝, completed=绿, failed=红）

## 5.5 跨页面改进

### 前端基础设施

- 加全局 ErrorBoundary（`frontend/src/components/ErrorBoundary.tsx`）
- 加通知系统（进化完成、工作流失败等事件）— 用 `sonner` 的 toast
- 清理所有 `as any` 和 `Record<string, unknown>`，替换为具体类型
- 加 loading 骨架屏（`<Skeleton />` 组件）

### 路由和导航更新

文件：`frontend/src/router.tsx`（修改）

添加路由：
```tsx
// 业务数字孪生
{ path: '/business-twin', element: lazy(() => import('@/pages/business-twin/BusinessTimeline')) },
{ path: '/business-twin/graph', element: lazy(() => import('@/pages/business-twin/KnowledgeGraph')) },
{ path: '/business-twin/predictions', element: lazy(() => import('@/pages/business-twin/PredictionDashboard')) },
{ path: '/business-twin/simulate', element: lazy(() => import('@/pages/business-twin/SimulationSandbox')) },
{ path: '/business-twin/assistant', element: lazy(() => import('@/pages/business-twin/AIAssistant')) },

// Agent进化补充
{ path: '/agent-evolution/hooks', element: lazy(() => import('@/pages/agent-evolution/HookManagement')) },
{ path: '/agent-evolution/datasets', element: lazy(() => import('@/pages/agent-evolution/DatasetManagement')) },
{ path: '/agent-evolution/workflow-monitor', element: lazy(() => import('@/pages/agent-evolution/WorkflowMonitor')) },
```

文件：`frontend/src/layouts/AppLayout.tsx`（修改）

在导航中添加菜单组：
```
业务数字孪生（新增菜单组）
  ├── 时间轴（BusinessTimeline）
  ├── 知识图谱（KnowledgeGraph）
  ├── 预测中心（PredictionDashboard）
  ├── 模拟沙盘（SimulationSandbox）
  └── AI助手（AIAssistant）

智能进化（已有，补充子菜单）
  ├── 进化总览（已有）
  ├── Hook管理（新增）
  ├── 数据集管理（新增）
  ├── 工作流监控（新增）
  └── 进化审批（已有）
```

---

# 新增依赖汇总

## Python（写入 backend/requirements.txt）

```
prophet>=1.1.5
pandas>=2.0.0
numpy>=1.24.0
apscheduler>=3.10.0
pgvector>=0.2.4
```

## Node.js（在 frontend/ 目录下 npm install）

```bash
npm install @antv/g6 react-diff-viewer-continued
```

---

# 数据库迁移

创建 Alembic 迁移脚本，新增表：
- `biz_events`
- `biz_entities`
- `biz_relations`
- `biz_metrics`

命令：
```bash
cd backend
alembic revision --autogenerate -m "add business digital twin tables"
alembic upgrade head
```

---

# 执行顺序

```
Phase 0（Bug修复）           → 立即开始，1小时
Phase 1（数据整合）          → Phase 0之后，含4个后端文件+2个前端文件
Phase 2（知识图谱）          → Phase 1之后，含3个后端文件+1个前端文件+修改memory
Phase 3（预测引擎）          → Phase 2之后，含2个后端文件+1个前端文件
Phase 4（模拟沙盘）          → Phase 3之后，含2个后端文件+1个前端文件
Phase 5（NL交互+前端完善）   → Phase 4之后，含5个后端文件+10个前端文件修改

每个Phase完成后：
1. 跑 python -c "import ast; ast.parse(open('文件路径').read())" 验证语法
2. 跑 alembic upgrade head 应用数据库迁移（如有新表）
3. 确认前端 npm run build 无报错
```

---

# 注意事项

1. **不改现有业务逻辑** — Phase 1 的事件采集只是在现有操作后加一行 `emit_event` 调用
2. **预测服务保持API兼容** — Phase 3 重写 `ai_prediction_service.py` 但保持 `/predictions/*` 端点的入参和出参格式兼容
3. **LLM调用全走 `ai_gateway.routed_chat()`** — 新增的LLM调用全部用智能路由，不要直接用 `provider.chat`
4. **新文件用中文docstring** — 和现有代码风格保持一致
5. **前端组件用 shadcn/ui** — 不要引入 Ant Design 或 Material UI，保持一致性
6. **所有新表继承 `TenantBase`** — 多租户隔离
7. **TypeScript 类型严格** — 不要用 `any`，用具体类型或泛型
8. **先跑通再迭代** — 每个Phase完成后确认能启动、不报错，再进入下一个Phase
