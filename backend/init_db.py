import asyncio
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory, engine, Base
from app.core.security import get_password_hash
from app.models.organization import *
from app.models.workflow import *
from app.models.project import *
from app.models.charging import *
from app.models.erp import *
from app.models.finance import *
from app.models.business import *
from app.models.petty_cash import *

YESTERDAY = date.today() - timedelta(days=1)

def d(s: str) -> date:
    return date.fromisoformat(s) if isinstance(s, str) else s

GROUP_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
POWER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
CHARGE_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")
TAX_ID = uuid.UUID("00000000-0000-0000-0000-000000000004")
ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
USER_PM_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")
USER_OPS_ID = uuid.UUID("00000000-0000-0000-0000-000000000012")
USER_FIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000013")
DEPT_ENG_ID = uuid.UUID("00000000-0000-0000-0000-000000000020")
DEPT_OPS_ID = uuid.UUID("00000000-0000-0000-0000-000000000021")
DEPT_FIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000022")

TODAY = date.today()
MON = TODAY.strftime("%Y-%m")
YESTERDAY = TODAY - timedelta(days=1)


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("✓ 数据库表创建完成")

    async with async_session_factory() as db:
        existing = await db.execute(select(User).where(User.id == ADMIN_ID))
        if existing.scalar_one_or_none():
            print("✓ 种子数据已存在，跳过")
            return

        db.add_all([
            Company(id=GROUP_ID, company_id=GROUP_ID, name="XX集团总部", short_name="集团", code="GROUP", company_type="group", status=1),
            Company(id=POWER_ID, company_id=GROUP_ID, name="XX电力工程有限公司", short_name="电力工程", code="POWER", company_type="power_engineering", status=1),
            Company(id=CHARGE_ID, company_id=GROUP_ID, name="XX充电站运营有限公司", short_name="充电站", code="CHARGE", company_type="charging_station", status=1),
            Company(id=TAX_ID, company_id=GROUP_ID, name="XX税务服务有限公司", short_name="税务服务", code="TAX", company_type="tax_service", status=1),
        ])

        db.add_all([
            Department(id=DEPT_ENG_ID, company_id=POWER_ID, name="工程部", code="P-ENG", status=1),
            Department(id=uuid.uuid4(), company_id=POWER_ID, name="安全管理部", code="P-SAFE", status=1),
            Department(id=uuid.uuid4(), company_id=POWER_ID, name="商务部", code="P-BIZ", status=1),
            Department(id=DEPT_OPS_ID, company_id=CHARGE_ID, name="运营部", code="C-OPS", status=1),
            Department(id=uuid.uuid4(), company_id=CHARGE_ID, name="市场部", code="C-MKT", status=1),
            Department(id=DEPT_FIN_ID, company_id=TAX_ID, name="财务部", code="T-FIN", status=1),
        ])

        db.add_all([
            User(id=ADMIN_ID, company_id=GROUP_ID, username="admin", password_hash=get_password_hash("AdminTemp2025Secure"), real_name="系统管理员", is_super_admin=True, status=1),
            User(id=USER_PM_ID, company_id=POWER_ID, username="pm01", password_hash=get_password_hash("UserTemp2025Secure"), real_name="张工程", phone="13800000001", gender=1, status=1),
            User(id=USER_OPS_ID, company_id=CHARGE_ID, username="ops01", password_hash=get_password_hash("UserTemp2025Secure"), real_name="李运营", phone="13800000002", gender=1, status=1),
            User(id=USER_FIN_ID, company_id=TAX_ID, username="fin01", password_hash=get_password_hash("UserTemp2025Secure"), real_name="王财务", phone="13800000003", gender=2, status=1),
        ])

        db.add_all([
            UserCompanyDepartment(user_id=USER_PM_ID, department_id=DEPT_ENG_ID, company_id=POWER_ID, position="项目经理", is_primary=True, status=1),
            UserCompanyDepartment(user_id=USER_OPS_ID, department_id=DEPT_OPS_ID, company_id=CHARGE_ID, position="运营经理", is_primary=True, status=1),
            UserCompanyDepartment(user_id=USER_FIN_ID, department_id=DEPT_FIN_ID, company_id=TAX_ID, position="财务主管", is_primary=True, status=1),
        ])

        role_admin = Role(id=uuid.uuid4(), company_id=GROUP_ID, name="集团管理员", code="group_admin", data_scope=1, is_system=True)
        role_pm = Role(id=uuid.uuid4(), company_id=POWER_ID, name="项目经理", code="pm", data_scope=3, is_system=True)
        role_ops = Role(id=uuid.uuid4(), company_id=CHARGE_ID, name="运营经理", code="ops_manager", data_scope=2, is_system=True)
        role_fin = Role(id=uuid.uuid4(), company_id=TAX_ID, name="财务主管", code="finance_lead", data_scope=2, is_system=True)
        db.add_all([role_admin, role_pm, role_ops, role_fin])

        db.add_all([
            UserRole(user_id=USER_PM_ID, role_id=role_pm.id, company_id=POWER_ID),
            UserRole(user_id=USER_OPS_ID, role_id=role_ops.id, company_id=CHARGE_ID),
            UserRole(user_id=USER_FIN_ID, role_id=role_fin.id, company_id=TAX_ID),
        ])

        menus = [
            ("dashboard", "管理驾驶舱", "Monitor", 1),
            ("organization", "组织架构", "OfficeBuilding", 2),
            ("project", "电力工程", "SetUp", 3),
            ("charging", "充电站运营", "Lightning", 4),
            ("finance", "财务管理", "Money", 5),
            ("system", "系统管理", "Setting", 6),
            ("ai", "AI决策", "DataAnalysis", 7),
        ]
        for code, name, icon, sort in menus:
            db.add(Permission(id=uuid.uuid4(), company_id=GROUP_ID, name=name, code=f"menu:{code}", type=1, icon=icon, sort_order=sort, status=1))

        action_perms = [
            ("project:view", "查看项目"), ("project:create", "创建项目"), ("project:update", "编辑项目"), ("project:delete", "删除项目"),
            ("contract:view", "查看合同"), ("contract:create", "创建合同"), ("contract:update", "编辑合同"), ("contract:delete", "删除合同"),
            ("supplier:view", "查看供应商"), ("supplier:create", "创建供应商"), ("supplier:update", "编辑供应商"),
            ("procurement:view", "查看采购"), ("procurement:create", "创建采购"), ("procurement:update", "编辑采购"),
            ("station:view", "查看充电站"), ("station:create", "创建充电站"), ("station:update", "编辑充电站"),
            ("device:view", "查看设备"), ("device:create", "创建设备"), ("device:update", "编辑设备"),
            ("fleet:view", "查看车队客户"), ("fleet:create", "创建车队客户"), ("fleet:update", "编辑车队客户"),
            ("invoice:view", "查看发票"), ("invoice:create", "创建发票"), ("invoice:update", "编辑发票"),
            ("voucher:view", "查看凭证"), ("voucher:create", "创建凭证"), ("voucher:update", "编辑凭证"),
            ("finance:view", "查看财务"), ("finance:create", "创建财务记录"),
            ("user:view", "查看用户"), ("user:create", "创建用户"), ("user:update", "编辑用户"), ("user:reset_password", "重置密码"),
            ("role:view", "查看角色"), ("role:create", "创建角色"), ("role:update", "编辑角色"),
            ("permission:view", "查看权限"), ("permission:manage", "管理权限"),
        ]
        for code, name in action_perms:
            db.add(Permission(id=uuid.uuid4(), company_id=GROUP_ID, name=name, code=code, type=2, sort_order=0, status=1))

        db.add_all([
            WorkflowTemplate(id=uuid.uuid4(), company_id=GROUP_ID, name="采购审批流程", code="procurement_approval", business_type="procurement", version=1, status=1, node_config={"steps": [{"name": "部门经理审批", "type": "single"}, {"name": "财务审批", "type": "single"}]}),
            WorkflowTemplate(id=uuid.uuid4(), company_id=GROUP_ID, name="付款审批流程", code="payment_approval", business_type="payment", version=1, status=1, node_config={"steps": [{"name": "财务主管审批", "type": "single"}, {"name": "总经理审批", "type": "single"}]}),
        ])

        p1 = Project(id=uuid.uuid4(), company_id=POWER_ID, project_code="PJ-2024-001", name="XX园区10kV配电工程", project_type="electric_power", status="in_progress", priority=1, total_budget=5000000, start_date=d("2024-03-01"), end_date=d("2024-12-31"), province="广东", city="深圳", address="XX工业园区", progress=45, project_manager_id=USER_PM_ID, created_by=ADMIN_ID)
        p2 = Project(id=uuid.uuid4(), company_id=POWER_ID, project_code="PJ-2024-002", name="XX光伏电站接入工程", project_type="solar", status="planning", priority=2, total_budget=3200000, start_date=d("2024-06-01"), end_date=d("2025-03-31"), province="广东", city="广州", progress=10, project_manager_id=USER_PM_ID, created_by=ADMIN_ID)
        p3 = Project(id=uuid.uuid4(), company_id=POWER_ID, project_code="PJ-2024-003", name="XX充电站电力增容工程", project_type="charging_station", status="completed", priority=3, total_budget=800000, start_date=d("2024-01-15"), end_date=d("2024-04-30"), province="广东", city="东莞", progress=100, project_manager_id=USER_PM_ID, created_by=ADMIN_ID)
        db.add_all([p1, p2, p3])

        db.add_all([
            ProjectMilestone(project_id=p1.id, company_id=POWER_ID, name="勘察设计", planned_date=d("2024-03-15"), actual_date=d("2024-03-18"), status="completed", sort_order=1, created_by=ADMIN_ID),
            ProjectMilestone(project_id=p1.id, company_id=POWER_ID, name="设备采购", planned_date=d("2024-04-01"), actual_date=d("2024-04-05"), status="completed", sort_order=2, created_by=ADMIN_ID),
            ProjectMilestone(project_id=p1.id, company_id=POWER_ID, name="施工安装", planned_date=d("2024-05-01"), status="in_progress", sort_order=3, created_by=ADMIN_ID),
            ProjectMilestone(project_id=p1.id, company_id=POWER_ID, name="调试验收", planned_date=d("2024-11-01"), status="pending", sort_order=4, created_by=ADMIN_ID),
        ])

        db.add_all([
            ConstructionLog(project_id=p1.id, log_date=YESTERDAY, weather="晴", temperature="28℃", work_content="完成配电柜安装，共12面", worker_count=15, equipment_used="吊车、扳手、万用表", safety_status="normal", recorder_id=USER_PM_ID, company_id=POWER_ID, created_by=USER_PM_ID),
            ConstructionLog(project_id=p1.id, log_date=TODAY - timedelta(days=2), weather="多云", temperature="26℃", work_content="电缆敷设完成500米", worker_count=12, equipment_used="电缆牵引机", safety_status="normal", recorder_id=USER_PM_ID, company_id=POWER_ID, created_by=USER_PM_ID),
        ])

        s1 = ChargingStation(id=uuid.uuid4(), company_id=CHARGE_ID, station_code="ST-001", name="XX科技园充电站", station_type="public", status="operating", province="广东", city="深圳", district="南山区", address="XX科技园A栋停车场", total_parking=20, monthly_rent=15000, power_capacity=500, operation_start_date=d("2024-01-01"), created_by=ADMIN_ID)
        s2 = ChargingStation(id=uuid.uuid4(), company_id=CHARGE_ID, station_code="ST-002", name="XX商务中心充电站", station_type="public", status="operating", province="广东", city="深圳", district="福田区", address="XX商务中心B1层", total_parking=12, monthly_rent=12000, power_capacity=300, operation_start_date=d("2024-03-15"), created_by=ADMIN_ID)
        s3 = ChargingStation(id=uuid.uuid4(), company_id=CHARGE_ID, station_code="ST-003", name="XX工业区充电站", station_type="exclusive", status="constructing", province="广东", city="东莞", district="松山湖", address="XX工业园3号门", total_parking=30, monthly_rent=8000, power_capacity=800, created_by=ADMIN_ID)
        db.add_all([s1, s2, s3])

        db.add_all([
            ChargingDevice(station_id=s1.id, device_code="DEV-001-01", manufacturer="特来电", model="TC-DC-120kW", device_type="dc_fast", rated_power=120, gun_count=2, status="online", total_charging_kwh=50000, total_charging_count=1200, company_id=CHARGE_ID, created_by=ADMIN_ID),
            ChargingDevice(station_id=s1.id, device_code="DEV-001-02", manufacturer="特来电", model="TC-DC-120kW", device_type="dc_fast", rated_power=120, gun_count=2, status="online", total_charging_kwh=48000, total_charging_count=1100, company_id=CHARGE_ID, created_by=ADMIN_ID),
            ChargingDevice(station_id=s1.id, device_code="DEV-001-03", manufacturer="星星充电", model="XX-AC-7kW", device_type="ac_slow", rated_power=7, gun_count=1, status="online", total_charging_kwh=5000, total_charging_count=800, company_id=CHARGE_ID, created_by=ADMIN_ID),
            ChargingDevice(station_id=s2.id, device_code="DEV-002-01", manufacturer="特来电", model="TC-DC-60kW", device_type="dc_fast", rated_power=60, gun_count=1, status="online", total_charging_kwh=30000, total_charging_count=800, company_id=CHARGE_ID, created_by=ADMIN_ID),
        ])

        f1 = FleetCustomer(id=uuid.uuid4(), company_id=CHARGE_ID, fleet_name="XX物流有限公司", fleet_code="FL-001", contact_person="陈经理", contact_phone="13900000001", fleet_size=50, credit_limit=200000, balance=85000, total_charged_kwh=120000, total_payment=180000, status="active", created_by=ADMIN_ID)
        f2 = FleetCustomer(id=uuid.uuid4(), company_id=CHARGE_ID, fleet_name="XX网约车公司", fleet_code="FL-002", contact_person="王总", contact_phone="13900000002", fleet_size=200, credit_limit=500000, balance=230000, total_charged_kwh=350000, total_payment=520000, status="active", created_by=ADMIN_ID)
        db.add_all([f1, f2])

        db.add(FleetRechargeRecord(fleet_id=f1.id, recharge_no="FR001", amount=50000, bonus_amount=2000, payment_method="bank_transfer", balance_before=33000, balance_after=85000, status="confirmed", confirmed_by=USER_OPS_ID, company_id=CHARGE_ID, created_by=USER_OPS_ID))

        db.add_all([
            Partnership(id=uuid.uuid4(), company_id=CHARGE_ID, partner_name="广汽能源", partner_type="gac", cooperation_type="self_build_cooperate", contact_person="刘经理", contact_phone="13700000001", start_date=d("2024-01-01"), end_date=d("2026-12-31"), status="active", created_by=ADMIN_ID),
            Partnership(id=uuid.uuid4(), company_id=CHARGE_ID, partner_name="蔚来能源", partner_type="nio", cooperation_type="joint_charge", contact_person="赵经理", contact_phone="13700000002", start_date=d("2024-03-01"), end_date=d("2026-02-28"), status="active", created_by=ADMIN_ID),
        ])

        db.add_all([
            TargetCustomer(id=uuid.uuid4(), company_id=CHARGE_ID, customer_name="XX公交集团", customer_type="transit", contact_person="孙主任", contact_phone="13600000001", estimated_fleet_size=300, estimated_monthly_kwh=150000, current_stage="negotiating", win_probability=70, assigned_to=USER_OPS_ID, status="active", created_by=USER_OPS_ID),
            TargetCustomer(id=uuid.uuid4(), company_id=CHARGE_ID, customer_name="XX出租车公司", customer_type="taxi", contact_person="周经理", contact_phone="13600000002", estimated_fleet_size=150, estimated_monthly_kwh=80000, current_stage="visiting", win_probability=40, assigned_to=USER_OPS_ID, status="active", created_by=USER_OPS_ID),
        ])

        db.add_all([
            Supplier(id=uuid.uuid4(), company_id=POWER_ID, name="XX电缆有限公司", code="SUP-001", category="cable", contact_person="郑经理", contact_phone="13500000001", rating=4, status=1, created_by=ADMIN_ID),
            Supplier(id=uuid.uuid4(), company_id=POWER_ID, name="XX电气设备有限公司", code="SUP-002", category="equipment", contact_person="吴经理", contact_phone="13500000002", rating=5, status=1, created_by=ADMIN_ID),
        ])

        db.add_all([
            FinanceVoucher(id=uuid.uuid4(), company_id=TAX_ID, voucher_no="V202406001", voucher_date=d("2024-06-01"), period="2024-06", voucher_type="general", line_count=2, total_debit=100000, total_credit=100000, business_type="revenue", source_module="manual", status="posted", prepared_by=USER_FIN_ID, created_by=USER_FIN_ID),
            FinanceVoucher(id=uuid.uuid4(), company_id=TAX_ID, voucher_no="V202406002", voucher_date=d("2024-06-02"), period="2024-06", voucher_type="general", line_count=2, total_debit=5000, total_credit=5000, business_type="expense", source_module="manual", status="reviewed", prepared_by=USER_FIN_ID, created_by=USER_FIN_ID),
        ])

        db.add_all([
            ArApRecord(type="ar", counterparty="XX物流有限公司", total_amount=50000, settled_amount=0, remaining_amount=50000, due_date=TODAY + timedelta(days=30), status="pending", company_id=TAX_ID, created_by=USER_FIN_ID),
            ArApRecord(type="ap", counterparty="XX电缆有限公司", total_amount=120000, settled_amount=60000, remaining_amount=60000, due_date=TODAY + timedelta(days=15), status="partial", company_id=TAX_ID, created_by=USER_FIN_ID),
        ])

        db.add_all([
            Invoice(invoice_type="增值税专用", direction="out", invoice_code="4400240000", invoice_no="12345678", issue_date=d("2024-06-05"), seller_name="XX税务服务有限公司", buyer_name="XX集团总部", amount_before_tax=88495.58, tax_rate=13, tax_amount=11504.42, total_amount=100000, check_status="checked", company_id=TAX_ID, created_by=USER_FIN_ID),
            Invoice(invoice_type="增值税普通", direction="in", invoice_code="4400240001", invoice_no="87654321", issue_date=d("2024-06-03"), seller_name="XX办公用品", buyer_name="XX税务服务有限公司", amount_before_tax=4424.78, tax_rate=13, tax_amount=575.22, total_amount=5000, check_status="unchecked", company_id=TAX_ID, created_by=USER_FIN_ID),
        ])

        db.add_all([
            TaxDeclaration(tax_type="增值税", period=MON, taxable_amount=500000, tax_rate=13, tax_amount=65000, paid_amount=65000, payment_date=YESTERDAY, status="paid", company_id=TAX_ID, created_by=USER_FIN_ID),
            TaxDeclaration(tax_type="企业所得税", period=MON, taxable_amount=200000, tax_rate=25, tax_amount=50000, status="declared", company_id=TAX_ID, created_by=USER_FIN_ID),
        ])

        db.add_all([
            Budget(name="2024年Q3运营预算", period_type="quarter", period="2024-Q3", total_budget=800000, total_used=230000, status="active", company_id=CHARGE_ID, created_by=ADMIN_ID),
            Budget(name="XX配电工程项目预算", period_type="month", period=MON, project_id=p1.id, total_budget=5000000, total_used=2250000, status="active", company_id=POWER_ID, created_by=ADMIN_ID),
        ])

        db.add_all([
            ElectricityPayment(station_id=s1.id, period=MON, meter_reading_start=10000, meter_reading_end=15000, total_kwh=5000, total_amount=4500, due_date=TODAY + timedelta(days=10), payment_status="unpaid", company_id=CHARGE_ID, created_by=USER_OPS_ID),
            ElectricityPayment(station_id=s2.id, period=MON, meter_reading_start=5000, meter_reading_end=8000, total_kwh=3000, total_amount=2700, payment_date=YESTERDAY, payment_status="paid", company_id=CHARGE_ID, created_by=USER_OPS_ID),
        ])

        db.add(StationFinancialMonthly(station_id=s1.id, month=MON, total_orders=580, total_kwh=12000, total_energy_revenue=18000, total_service_revenue=6000, total_revenue=24000, electricity_cost=10800, rent_cost=15000, depreciation=3000, maintenance_cost=2000, labor_cost=8000, total_cost=38800, gross_profit=-14800, gross_margin=-61.67, status="confirmed", company_id=CHARGE_ID, created_by=USER_OPS_ID))

        db.add(MonthlyTaskList(month=MON, task_type="inspection", title="ST-001月度设备巡检", description="对科技园充电站所有设备进行月度巡检", assignee_id=USER_OPS_ID, station_id=s1.id, priority=1, planned_start=d(f"{MON}-01"), planned_end=d(f"{MON}-05"), completion_rate=100, status="completed", company_id=CHARGE_ID, created_by=USER_OPS_ID))
        db.add(MonthlyTaskList(month=MON, task_type="marketing", title="Q3目标客户开发计划", description="完成3家目标客户的初步接触", assignee_id=USER_OPS_ID, priority=2, planned_start=d(f"{MON}-01"), planned_end=d(f"{MON}-30"), completion_rate=30, status="in_progress", company_id=CHARGE_ID, created_by=USER_OPS_ID))

        from app.models.charging import SiteProspect
        from app.models.project import ServiceTicket, InspectionRecord

        db.add_all([
            SiteProspect(name="XX商业广场停车场", province="广东", city="深圳", district="福田区", address="XX商业广场地下B2层", area_size=800, land_type="parking", owner_name="李经理", owner_phone="13800000111", expected_rent=18000, lease_term_months=36, traffic_flow_score=85, parking_demand_score=90, competition_score=60, power_supply_score=75, overall_score=78, estimated_investment=350000, estimated_monthly_revenue=28000, estimated_roi_months=15, status="visiting", assigned_to=USER_OPS_ID, company_id=CHARGE_ID, created_by=USER_OPS_ID),
            SiteProspect(name="XX工业园区A区", province="广东", city="东莞", district="松山湖", address="XX工业园A区东门", area_size=1500, land_type="industrial", owner_name="王总", owner_phone="13800000222", expected_rent=10000, lease_term_months=60, traffic_flow_score=70, parking_demand_score=80, competition_score=40, power_supply_score=95, overall_score=71, estimated_investment=500000, estimated_monthly_revenue=35000, estimated_roi_months=18, status="negotiating", assigned_to=USER_OPS_ID, company_id=CHARGE_ID, created_by=USER_OPS_ID),
        ])

        db.add_all([
            ServiceTicket(project_id=p1.id, ticket_no="SV20240600001", service_type="inspection", title="配电柜绝缘检测", description="配电柜A3绝缘电阻偏低，需检测", customer_name="XX园区物业", customer_phone="13900000003", priority=2, status="processing", assigned_to=USER_PM_ID, assigned_at=YESTERDAY, warranty_start=d("2024-06-01"), warranty_end=d("2025-05-31"), company_id=POWER_ID, created_by=USER_PM_ID),
            ServiceTicket(project_id=p1.id, ticket_no="SV20240600002", service_type="repair", title="电缆接头发热", description="施工人员报告B区电缆接头温度异常", customer_name="XX园区物业", customer_phone="13900000003", priority=1, status="pending", warranty_start=d("2024-06-01"), warranty_end=d("2025-05-31"), company_id=POWER_ID, created_by=USER_PM_ID),
        ])

        db.add_all([
            InspectionRecord(project_id=p1.id, inspection_type="routine", inspection_date=YESTERDAY, inspector_id=USER_PM_ID, overall_result="warning", issues_found="A3配电柜绝缘电阻偏低（2MΩ，标准>5MΩ）", rectification_required=True, rectification_deadline=TODAY + timedelta(days=3), rectification_status="pending", company_id=POWER_ID, created_by=USER_PM_ID),
        ])

        await db.commit()
        print("✓ 种子数据初始化完成")
        print("  管理员: admin / AdminTemp2025Secure")
        print("  项目经理: pm01 / UserTemp2025Secure")
        print("  运营经理: ops01 / UserTemp2025Secure")
        print("  财务主管: fin01 / UserTemp2025Secure")
        print(f"  示例数据: 3个项目, 3个充电站, 4台设备, 2个车队客户, 凭证/发票/税务等")


if __name__ == "__main__":
    asyncio.run(seed())
