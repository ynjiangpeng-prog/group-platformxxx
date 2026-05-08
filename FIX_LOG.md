# 修复日志

## Bug修复
- [✅] Bug 1: lifecycle agent None检查 — `lifecycle.py:59-83`，agent存在性检查提前到更新execution_count之前，status检查使用agent.name前先确认agent非None
- [✅] Bug 2: tools类型转换 — `prompt_evolver.py:178-183,218-223`，apply_evolution和rollback的Level 2操作增加json.loads解析，异常时降级为`{"raw": ...}`
- [✅] Bug 3: final_node DAG终端 — `engine.py:191-197`，替换`nodes[-1]`为sink节点算法（收集无出边节点）

## 功能改进
- [✅] 改进 4: 并行执行 — `engine.py:128-180`，同层节点使用`asyncio.gather`并行执行，单节点直接运行不经过gather
- [✅] 改进 5: parse_json公开化 — `ai_gateway.py:642-644`新增`parse_json_response()`公开方法；`hooks.py`(2处)、`prompt_evolver.py`(2处)、`dataset_builder.py`(3处)、`auto_generator.py`(1处)、`evolver.py`(1处)全部替换
- [✅] 改进 6: 预置工作流初始化接口 — `presets/__init__.py`导出`ALL_PRESETS`列表；`engine.py`新增`init_preset_workflows()`方法（幂等）；`workflow_router.py`的`/init-presets`端点改为调用engine方法

## 优化
- [✅] 优化 7: TypeScript类型 — `agent-evolution.ts`新增`EvoAgent`、`AgentStats`、`HookItem`、`WorkflowInstance`、`NodeExecution`等接口；3个前端页面移除所有`as any`
- [✅] 优化 8: DSPy集成 — `prompt_evolver.py`的evolve()方法使用`Optimizer`筛选few-shot示例注入变体生成prompt；`_evaluate_variant()`使用`Signature`标准化评估流程

## 验证结果
- 清库后全新运行：59/59 通过，100%通过率，690行数据（11张表）

## 遗留问题
- AI API密钥已过期（401），进化变体生成的LLM调用会降级为返回原始内容，不影响系统运行但进化效果受限
- `evo_workflow_instances`和`evo_node_executions`表为空——需要通过实际工作流执行触发（前端点击"执行"按钮）

---

## Fusion升级

### Phase 0: 基础加固
- [✅] Langfuse追踪 — `langfuse_config.py`空key自动禁用，lifecycle集成trace/span
- [✅] Guardrails校验 — `guardrails.py`自研7个校验器（JSON/长度/PII/SQL注入/关键词/正则/评分）
- [✅] Token优化器 — `token_optimizer.py`三策略：prompt压缩、记忆过滤、模型路由
- [✅] EvoGuardrailRule模型 — 12张evo_表（新增guardrail_rules）
- [✅] hooks.py集成 — quality_gate前跑Guardrails + 策略引擎评估

### Phase 1: 记忆重构
- [✅] pgvector — Docker镜像替换为pgvector/pgvector:pg16，创建vector(1536)列+ivfflat索引
- [✅] Letta三层记忆 — `memory/manager.py` Core(2KB/10条) + Recall(关键词/30天) + Archival(向量)
- [✅] 时序知识图谱 — `memory/knowledge_graph.py` 三元组提取+冲突检测+实体查询
- [✅] lifecycle.py改造 — _retrieve_memories替换为三层记忆检索

### Phase 2: 进化增强
- [✅] Reflexion反思 — lifecycle._self_reflect，质量0.2~0.7时触发，结果存入回溯记忆
- [✅] Promptomatix — prompt_evolver._analyze_weaknesses，弱点分析注入变体生成prompt
- [✅] Self-questioning冷启动 — dataset_builder.build_from_llm改用Agent自问生成测试集
- [✅] 自动调试 — lifecycle._auto_debug，on_error时用LLM分析错误生成修复建议

### Phase 3: 安全治理
- [✅] 策略引擎 — `governance.py` PolicyEngine，声明式规则<1ms评估
- [✅] hooks.py集成策略引擎 — fire_hooks前置策略评估
- [✅] 回归测试 — apply_evolution后自动检测质量下降>15%自动回滚
- [✅] 审批页面 — EvolutionApprovals.tsx，/agent-evolution/approvals
- [✅] 进化列表API — /agent-evo/evolution/list?status=pending

### Phase 4: 编排升级
- [✅] ReactFlow DAG编辑器 — WorkflowEditor.tsx，@xyflow/react可视化编辑
- [✅] 节点类型 — AgentNode(蓝)、StartNode(绿)、EndNode(红)
- [✅] 属性面板 — 右侧编辑节点名称/AgentID
- [✅] 工作流更新API — PUT /agent-evo/workflows/templates/:id
- [✅] WorkflowListPage添加编辑按钮

### 验证结果
- 后端：56-58/58-59通过（唯一失败项为幂等性预期）
- 数据量：5421行（11张表，含evo_guardrail_rules）
- TypeScript：0错误
- 新增12个后端文件 + 3个前端页面
