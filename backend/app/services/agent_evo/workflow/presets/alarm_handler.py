"""预置工作流：告警处理

流程：告警接收 → 根因分析 → 影响评估 → 处置建议 → 执行确认 → 复盘
"""

PRESET = {
    "name": "告警处理流程",
    "description": "接收告警后自动分析根因、评估影响范围、生成处置建议并确认执行",
    "category": "监控告警",
    "graph_config": {
        "nodes": [
            {"id": "receive", "name": "告警接收", "agent_id": None, "params": {}, "input_mapping": {"alert": "$global.alert"}},
            {"id": "root_cause", "name": "根因分析", "agent_id": None, "params": {}, "input_mapping": {"alert": "alert"}},
            {"id": "impact", "name": "影响评估", "agent_id": None, "params": {}, "input_mapping": {"alert": "alert", "root_cause": "root_cause"}},
            {"id": "suggest", "name": "处置建议", "agent_id": None, "params": {}, "input_mapping": {"root_cause": "root_cause", "impact": "impact"}},
            {"id": "confirm", "name": "执行确认", "agent_id": None, "params": {}, "input_mapping": {"suggestions": "suggestions"}},
            {"id": "review", "name": "复盘总结", "agent_id": None, "params": {}, "input_mapping": {"alert": "alert", "action_taken": "confirmed_actions", "result": "execution_result"}},
        ],
        "edges": [
            {"source": "receive", "target": "root_cause", "field_mapping": {}},
            {"source": "root_cause", "target": "impact", "field_mapping": {}},
            {"source": "impact", "target": "suggest", "field_mapping": {}},
            {"source": "suggest", "target": "confirm", "field_mapping": {}},
            {"source": "confirm", "target": "review", "field_mapping": {}},
        ],
    },
}
