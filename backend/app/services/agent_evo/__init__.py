"""Agent自进化服务包"""
from app.services.agent_evo.registry import agent_registry
from app.services.agent_evo.hooks import hook_manager
from app.services.agent_evo.lifecycle import agent_lifecycle

__all__ = ["agent_registry", "hook_manager", "agent_lifecycle"]
