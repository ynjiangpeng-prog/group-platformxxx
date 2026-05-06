from app.services.autopilot.dashboard_service import AutopilotDashboard
from app.services.autopilot.alert_engine import AlertEngine
from app.services.autopilot.report_service import ReportService
from app.services.autopilot.command_service import CommandService

dashboard_service = AutopilotDashboard()
alert_engine = AlertEngine()
report_service = ReportService()
command_service = CommandService()
