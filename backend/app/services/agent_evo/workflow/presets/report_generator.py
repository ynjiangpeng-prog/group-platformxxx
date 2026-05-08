"""预置工作流：智能报告生成

流程：数据汇总 → 趋势分析 → 异常发现 → 报告生成 → 审核提交
"""

PRESET = {
    "name": "智能报告生成",
    "description": "自动汇总数据、分析趋势、发现异常，生成结构化经营报告",
    "category": "报告分析",
    "graph_config": {
        "nodes": [
            {"id": "collect", "name": "数据汇总", "agent_id": None, "params": {}, "input_mapping": {"report_type": "$global.report_type", "period": "$global.period"}},
            {"id": "trend", "name": "趋势分析", "agent_id": None, "params": {}, "input_mapping": {"data": "summary"}},
            {"id": "anomaly", "name": "异常发现", "agent_id": None, "params": {}, "input_mapping": {"data": "summary", "trends": "trends"}},
            {"id": "report", "name": "报告生成", "agent_id": None, "params": {}, "input_mapping": {"summary": "summary", "trends": "trends", "anomalies": "anomalies"}},
        ],
        "edges": [
            {"source": "collect", "target": "trend", "field_mapping": {}},
            {"source": "collect", "target": "anomaly", "field_mapping": {}},
            {"source": "trend", "target": "report", "field_mapping": {}},
            {"source": "anomaly", "target": "report", "field_mapping": {}},
        ],
    },
}
