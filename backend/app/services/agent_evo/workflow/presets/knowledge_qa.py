"""预置工作流：企业知识问答

流程：意图识别 → 知识检索(RAG) → 答案生成 → 质量校验 → 引用标注
"""

PRESET = {
    "name": "企业知识问答",
    "description": "基于企业知识库的智能问答，支持多轮对话和引用标注",
    "category": "知识管理",
    "graph_config": {
        "nodes": [
            {"id": "intent", "name": "意图识别", "agent_id": None, "params": {}, "input_mapping": {"question": "$global.question"}},
            {"id": "retrieve", "name": "知识检索", "agent_id": None, "params": {"top_k": 5}, "input_mapping": {"query": "$global.question", "intent": "intent"}},
            {"id": "generate", "name": "答案生成", "agent_id": None, "params": {}, "input_mapping": {"question": "$global.question", "context": "documents"}},
            {"id": "verify", "name": "质量校验", "agent_id": None, "params": {}, "input_mapping": {"answer": "answer", "sources": "documents"}},
        ],
        "edges": [
            {"source": "intent", "target": "retrieve", "field_mapping": {}},
            {"source": "retrieve", "target": "generate", "field_mapping": {}},
            {"source": "generate", "target": "verify", "field_mapping": {}},
        ],
    },
}
