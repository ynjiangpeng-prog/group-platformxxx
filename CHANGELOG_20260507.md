# 集团综合管理平台 — 2026-05-07 改动总结

## 一、AI多提供商支持

### 改动文件
- `backend/app/core/ai.py` — 新增4个AI提供商定义（Zhipu/OpenAI/Kimi/NVIDIA）
- `backend/app/services/ai_gateway.py` — 重构为通用OpenAI兼容提供商，支持动态切换
- `backend/app/api/v1/ai/gateway_router.py` — 新增提供商管理、测试、切换接口
- `backend/app/api/v1/ai/stream_router.py` — 接入真实AI流式输出（替换模拟实现）
- `backend/app/main.py` — 注册stream_router

### 新增API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /ai/gateway/providers | 列出所有提供商及配置状态 |
| POST | /ai/gateway/providers/{id}/test | 测试指定提供商连通性 |
| POST | /ai/gateway/providers/switch | 切换活跃提供商（可传入API Key） |
| PUT | /ai/gateway/config | 更新AI配置（provider/api_key/model等） |
| POST | /ai/chat | 流式对话（SSE格式，真实AI） |

### 提供商配置
| 提供商 | 环境变量 | Base URL |
|--------|----------|----------|
| Zhipu AI | AI_API_KEY | open.bigmodel.cn/api/paas/v4 |
| OpenAI | OPENAI_API_KEY | api.openai.com/v1 |
| Kimi | KIMI_API_KEY | api.moonshot.cn/v1 |
| NVIDIA | NVIDIA_API_KEY | integrate.api.nvidia.com/v1 |

---

## 二、OCR拍照自动建单

### 改动文件
- `backend/app/api/v1/ai/ocr_router.py` — 新增4个auto-save接口 + 1个scan-and-save统一入口

### 新增API
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/ocr/construction-log-auto-save | 拍照→自动创建施工日志 |
| POST | /ai/ocr/petty-cash-auto-save | 拍照→自动创建备用金报销 |
| POST | /ai/ocr/payment-doc-auto-save | 拍照→自动创建项目成本记录(ProjectLine) |
| POST | /ai/ocr/scan-and-save | 拍照→AI自动判断类型→创建对应记录（一键完成） |

### 流程
1. 用户拍照上传
2. AI自动分类（合同/发票/施工日志/付款凭证/报销单）
3. AI提取关键字段
4. 自动匹配项目（根据地点/对手方名称）
5. 创建数据库记录（draft/pending状态）
6. 返回记录ID，用户确认或修改

### 已有（之前实现）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/ocr/contract-auto-save | 拍照→自动创建合同 |
| POST | /ai/ocr/invoice-auto-save | 拍照→自动创建发票 |
| POST | /ai/ocr/smart-classify | 拍照→自动分类+识别（不创建记录） |

---

## 三、施工人工效率分析

### 新增文件
- `backend/app/services/labor_analysis.py` — LaborAnalysisService
- `backend/app/api/v1/project/labor_router.py` — 人工效率API路由

### 改动文件
- `backend/app/main.py` — 注册labor_router

### 新增API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /project/labor/company-overview | 全公司项目人工效率排名 |
| GET | /project/labor/project/{id}/dashboard | 单项目人工效率看板 |
| GET | /project/labor/project/{id}/daily-trend | 每日工人数量+成本趋势 |
| GET | /project/labor/project/{id}/idle-alerts | 窝工预警列表 |

### 分析指标
- **log_days**: 有施工日志的天数
- **total_worker_days**: 总工日
- **avg_daily_workers**: 日均工人数量
- **labor_cost**: 人工成本（来自ProjectLine line_type='labor'）
- **cost_per_worker_day**: 每工日成本
- **labor_ratio_pct**: 人工成本占总成本比例
- **cost_per_progress**: 每进度点成本

### 窝工预警规则
1. **worker_surge**: 工人数量超过均值50%+，但工作内容与昨日高度重复
2. **stagnant_work**: 连续3天工作内容高度重复，工人数量正常

---

## 四、降本增效理念融入

所有新增功能都围绕降本目标：

1. **数据自动采集** — 拍照创建施工日志，减少人工录入，数据更及时准确
2. **实时成本可视** — 每日人工成本、预算偏差率、进度成本比
3. **窝工预警** — 自动发现工人闲置，及时调拨，减少浪费
4. **跨项目对比** — 全公司项目效率排名，找出低效项目

---

## 五、前端待对接

以下API已就绪，前端需要对接：

1. **一键拍照按钮** — 调用 `POST /ai/ocr/scan-and-save`
2. **人工效率看板页面** — 调用 `/project/labor/company-overview` + `/project/labor/project/{id}/dashboard`
3. **窝工预警列表** — 调用 `/project/labor/project/{id}/idle-alerts`
4. **AI提供商管理页面** — 调用 `/ai/gateway/providers` 相关接口

---

## 六、服务器信息
- 地址: 114.55.53.253
- SSH: `ssh -i D:/Opencode/id_ed25519 root@114.55.53.253`
- 后端: systemd service `group-platform` on port 8000
- 前端: Nginx on port 8080
- 数据库: PostgreSQL 16
- 缓存: Redis
- 对象存储: MinIO
- 部署脚本: `bash D:/group/sync_to_cloud.sh`
- 超管账号: admin / admin123
- 当前AI提供商: Zhipu AI (智谱)
