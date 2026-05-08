"""Letta三层记忆系统

Core Memory — 直接注入system prompt（CPU寄存器）
Recall Memory — 近期对话摘要（缓存）
Archival Memory — pgvector语义检索（磁盘）
"""

from app.services.agent_evo.memory.manager import LettaMemoryManager

memory_manager = LettaMemoryManager()
