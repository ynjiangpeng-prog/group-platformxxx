"""预置工作流：设备巡检自动派单

流程：数据采集 → 异常检测 → 预警 → 派单 → 跟踪
"""

PRESET = {
    "name": "设备巡检自动派单",
    "description": "自动采集充电桩设备数据，检测异常，生成预警并派单处理",
    "category": "设备管理",
    "graph_config": {
        "nodes": [
            {"id": "collect", "name": "数据采集", "agent_id": None, "params": {"source": "charging_devices"}, "input_mapping": {"station_id": "$global.station_id"}},
            {"id": "detect", "name": "异常检测", "agent_id": None, "params": {"threshold": "auto"}, "input_mapping": {"device_data": "raw_data"}},
            {"id": "alert", "name": "预警分析", "agent_id": None, "params": {}, "input_mapping": {"anomalies": "anomalies"}},
            {"id": "dispatch", "name": "自动派单", "agent_id": None, "params": {"assign_rule": "nearest_available"}, "input_mapping": {"alert_info": "alert_result"}},
            {"id": "track", "name": "跟踪反馈", "agent_id": None, "params": {}, "input_mapping": {"ticket_id": "ticket_id"}},
        ],
        "edges": [
            {"source": "collect", "target": "detect", "field_mapping": {"device_data": "raw_data"}},
            {"source": "detect", "target": "alert", "field_mapping": {"anomalies": "anomalies"}},
            {"source": "alert", "target": "dispatch", "field_mapping": {"alert_info": "alert_result"}},
            {"source": "dispatch", "target": "track", "field_mapping": {"ticket_id": "ticket_id"}},
        ],
    },
}
