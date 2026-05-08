"""预置工作流模板"""

from .device_inspection import PRESET as device_inspection
from .work_order_handler import PRESET as work_order_handler
from .knowledge_qa import PRESET as knowledge_qa
from .report_generator import PRESET as report_generator
from .alarm_handler import PRESET as alarm_handler

ALL_PRESETS = [device_inspection, work_order_handler, knowledge_qa, report_generator, alarm_handler]
