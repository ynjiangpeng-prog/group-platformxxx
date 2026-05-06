import { Suspense, lazy } from "react"
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/store/auth"
import AppLayout from "@/layouts/AppLayout"

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"))
const NotFoundPage = lazy(() => import("@/pages/not-found/NotFoundPage"))

const ProjectBoard = lazy(() => import("@/pages/dashboard/ProjectBoard"))
const ProjectCockpit = lazy(() => import("@/pages/project/ProjectCockpit"))
const ProjectCreatePage = lazy(() => import("@/pages/project/ProjectCreatePage"))

const MyTodoPage = lazy(() => import("@/pages/my/MyTodoPage"))
const MyPettyCashPage = lazy(() => import("@/pages/my/MyPettyCashPage"))
const AiAssistantPage = lazy(() => import("@/pages/my/AiAssistantPage"))
const AiPage = lazy(() => import("@/pages/ai/AiPage"))

const WeeklyPlanPage = lazy(() => import("@/pages/business/WeeklyPlanPage"))
const DailyPlanPage = lazy(() => import("@/pages/business/DailyPlanPage"))
const DailyFeedbackPage = lazy(() => import("@/pages/business/DailyFeedbackPage"))
const DailyExpensePage = lazy(() => import("@/pages/business/DailyExpensePage"))
const FixedExpensePage = lazy(() => import("@/pages/business/FixedExpensePage"))
const TravelPage = lazy(() => import("@/pages/travel/TravelPage"))

const ProjectListPage = lazy(() => import("@/pages/engineering/ProjectListPage"))
const LogPage = lazy(() => import("@/pages/engineering/LogPage"))
const TicketPage = lazy(() => import("@/pages/engineering/TicketPage"))
const InspectionPage = lazy(() => import("@/pages/engineering/InspectionPage"))

const StationListPage = lazy(() => import("@/pages/charging/StationListPage"))
const DeviceListPage = lazy(() => import("@/pages/charging/DeviceListPage"))
const OperationsPage = lazy(() => import("@/pages/charging/OperationsPage"))
const LeadPage = lazy(() => import("@/pages/charging/LeadPage"))
const OrderListPage = lazy(() => import("@/pages/charging/OrderListPage"))

const ContractListPage = lazy(() => import("@/pages/contract/ContractListPage"))
const ContractDetailPage = lazy(() => import("@/pages/contract/ContractDetailPage"))
const InvoiceListPage = lazy(() => import("@/pages/contract/InvoiceListPage"))
const ArApPage = lazy(() => import("@/pages/contract/ArApPage"))
const VoucherPage = lazy(() => import("@/pages/contract/VoucherPage"))

const OrganizationPage = lazy(() => import("@/pages/organization/OrganizationPage"))

const LogPageSystem = lazy(() => import("@/pages/system/LogPage"))
const ConfigPage = lazy(() => import("@/pages/system/ConfigPage"))

const WarehousePage = lazy(() => import("@/pages/warehouse/WarehousePage"))
const FixedAssetPage = lazy(() => import("@/pages/assets/FixedAssetPage"))

const PlanPage = lazy(() => import("@/pages/business/PlanPage"))
const OperationStrategyPage = lazy(() => import("@/pages/charging/OperationStrategyPage"))
const CustomerExpansionPage = lazy(() => import("@/pages/charging/CustomerExpansionPage"))
const OperationMemoPage = lazy(() => import("@/pages/charging/OperationMemoPage"))

const PettyCashAdminPage = lazy(() => import("@/pages/petty-cash/PettyCashAdminPage"))

const BankTransactionPage = lazy(() => import("@/pages/finance/BankTransactionPage"))
const CrossEntityFlowPage = lazy(() => import("@/pages/finance/CrossEntityFlowPage"))
const BudgetPage = lazy(() => import("@/pages/finance/BudgetPage"))
const ReportPage = lazy(() => import("@/pages/finance/ReportPage"))
const TaxPage = lazy(() => import("@/pages/finance/TaxPage"))
const WorkflowConfigPage = lazy(() => import("@/pages/workflow/WorkflowConfigPage"))
const CrmReminderPage = lazy(() => import("@/pages/crm/CrmReminderPage"))
const EntityManagePage = lazy(() => import("@/pages/entity/EntityManagePage"))
const InvestmentROIPage = lazy(() => import("@/pages/charging/InvestmentROIPage"))

const ErpContractPage = lazy(() => import("@/pages/erp/ContractPage"))
const ErpPoPage = lazy(() => import("@/pages/erp/PoPage"))
const ErpProcurementPage = lazy(() => import("@/pages/erp/ProcurementPage"))
const AuditPage = lazy(() => import("@/pages/audit/AuditPage"))
const AutopilotPage = lazy(() => import("@/pages/autopilot/AutopilotPage"))
const ExecutivePage = lazy(() => import("@/pages/autopilot/ExecutivePage"))
const AuditProjectPage = lazy(() => import("@/pages/audit/AuditProjectPage"))
const ErpReceiptPage = lazy(() => import("@/pages/erp/ReceiptPage"))
const ErpSupplierPage = lazy(() => import("@/pages/erp/SupplierPage"))
const CounterpartyFromFlowPage = lazy(() => import("@/pages/erp/CounterpartyFromFlowPage"))

function Loading() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function Lazy(
  Element: React.LazyExoticComponent<React.ComponentType>,
) {
  return (
    <Suspense fallback={<Loading />}>
      <Element />
    </Suspense>
  )
}

function AuthGuard() {
  const token = useAuthStore((s) => s.token)
  const init = useAuthStore((s) => s.init)
  const initialized = useAuthStore((s) => s.initialized)
  const loading = useAuthStore((s) => s.loading)

  if (!token) return <Navigate to="/login" replace />
  if (!initialized || loading) {
    init()
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: Lazy(LoginPage),
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: Lazy(ProjectBoard) },
          { path: "project/create", element: Lazy(ProjectCreatePage) },
          { path: "project/:id", element: Lazy(ProjectCockpit) },
          { path: "my-todo", element: Lazy(MyTodoPage) },
          { path: "my-petty-cash", element: Lazy(MyPettyCashPage) },
          { path: "petty-cash-admin", element: Lazy(PettyCashAdminPage) },
          { path: "ai-assistant", element: Lazy(AiAssistantPage) },
          { path: "ai", element: Lazy(AiPage) },
          { path: "business/weekly-plans", element: Lazy(PlanPage) },
          { path: "business/daily-plans", element: Lazy(PlanPage) },
          { path: "business/daily-feedbacks", element: Lazy(PlanPage) },
          { path: "business/daily-expenses", element: Lazy(DailyExpensePage) },
          { path: "business/fixed-expenses", element: Lazy(FixedExpensePage) },
          { path: "travel", element: Lazy(TravelPage) },
          { path: "engineering/projects", element: Lazy(ProjectListPage) },
          { path: "engineering/logs", element: Lazy(LogPage) },
          { path: "engineering/tickets", element: Lazy(TicketPage) },
          { path: "engineering/inspections", element: Lazy(InspectionPage) },
          { path: "charging/stations", element: Lazy(StationListPage) },
          { path: "charging/devices", element: Lazy(DeviceListPage) },
          { path: "charging/operations", element: Lazy(OperationsPage) },
          { path: "charging/strategy", element: Lazy(OperationStrategyPage) },
          { path: "charging/customer-expansion", element: Lazy(CustomerExpansionPage) },
          { path: "charging/operation-memo", element: Lazy(OperationMemoPage) },
          { path: "charging/leads", element: Lazy(LeadPage) },
          { path: "charging/orders", element: Lazy(OrderListPage) },
          { path: "contracts", element: Lazy(ContractListPage) },
          { path: "contracts/:id", element: Lazy(ContractDetailPage) },
          { path: "invoices", element: Lazy(InvoiceListPage) },
          { path: "ar-ap", element: Lazy(ArApPage) },
          { path: "vouchers", element: Lazy(VoucherPage) },
          { path: "organization", element: Lazy(OrganizationPage) },
          { path: "warehouse", element: Lazy(WarehousePage) },
          { path: "fixed-assets", element: Lazy(FixedAssetPage) },
          { path: "bank-transactions", element: Lazy(BankTransactionPage) },
          { path: "cross-entity-flow", element: Lazy(CrossEntityFlowPage) },
          { path: "finance/budgets", element: Lazy(BudgetPage) },
          { path: "finance/reports", element: Lazy(ReportPage) },
          { path: "finance/tax", element: Lazy(TaxPage) },
          { path: "workflow-config", element: Lazy(WorkflowConfigPage) },
          { path: "crm-reminders", element: Lazy(CrmReminderPage) },
          { path: "autopilot", element: Lazy(AutopilotPage) },
          { path: "executive", element: Lazy(ExecutivePage) },
          
          { path: "entities", element: Lazy(EntityManagePage) },
          { path: "investment-roi", element: Lazy(InvestmentROIPage) },
          { path: "erp/suppliers", element: Lazy(ErpSupplierPage) },
          { path: "erp/counterparty-flow", element: Lazy(CounterpartyFromFlowPage) },
          { path: "erp/procurement", element: Lazy(ErpProcurementPage) },
          { path: "erp/purchase-orders", element: Lazy(ErpPoPage) },
          { path: "erp/receipts", element: Lazy(ErpReceiptPage) },
          { path: "erp/contracts", element: Lazy(ErpContractPage) },
          { path: "system", element: Lazy(ConfigPage) },
          { path: "audit", element: Lazy(AuditPage) },
          { path: "audit/:projectId", element: Lazy(AuditProjectPage) },
          { path: "logs", element: Lazy(LogPageSystem) },
          { path: "*", element: Lazy(NotFoundPage) },
        ],
      },
    ],
  },
])
