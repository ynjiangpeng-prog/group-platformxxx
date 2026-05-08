"""预置工作流：智能工单处理

流程：意图识别 → 信息抽取 → 优先级评估 → 自动派发 → 执行跟踪 → 验收
"""

PRESET = {
    "name": "智能工单处理",
    "description": "自动识别工单意图，抽取关键信息，评估优先级并派发到合适的处理人",
    "category": "工单管理",
    "graph_config": {
        "nodes": [
            {"id": "intent", "name": "意图识别", "agent_id": None, "params": {}, "input_mapping": {"ticket_content": "$global.content"}},
            {"id": "extract", "name": "信息抽取", "agent_id": None, "params": {}, "input_mapping": {"content": "$global.content"}},
            {"id": "priority", "name": "优先级评估", "agent_id": None, "params": {}, "input_mapping": {"intent": "intent", "entities": "entities"}},
            {"id": "dispatch", "name": "自动派发", "agent_id": None, "params": {}, "input_mapping": {"priority": "priority", "category": "intent"}},
            {"id": "execute", "name": "执行跟踪", "agent_id": None, "params": {}, "input_mapping": {"assignee": "assignee"}},
            {"id": "verify", "name": "验收检查", "agent_id": None, "params": {}, "input_mapping": {"result": "execution_result"}},
        ],
        "edges": [
            {"source": "intent", "target": "extract", "field_mapping": {}},
            {"source": "extract", "target": "priority", "field_mapping": {}},
            {"source": "priority", "target": "dispatch", "field_mapping": {}},
            {"source": "dispatch", "target": "execute", "field_mapping": {}},
            {"source": "execute", "target": "verify", "field_mapping": {}},
        ],
    },
}
